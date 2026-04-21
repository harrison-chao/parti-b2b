import { Prisma, PrismaClient, type WorkOrderStatus } from "@prisma/client";
import { applyStockMovement } from "../src/lib/inventory";

const prisma = new PrismaClient();

const TX_OPTIONS = { timeout: 120_000, maxWait: 120_000 };

type CheckResult = {
  label: string;
  ok: boolean;
  detail?: string;
};

const results: CheckResult[] = [];

function money(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value);
}

function asNumber(value: number | Prisma.Decimal | null | undefined) {
  return Number(value ?? 0);
}

function stampNo(prefix: string, suffix: string) {
  return `${prefix}-SMOKE-${suffix}`;
}

function check(label: string, condition: boolean, detail?: string) {
  results.push({ label, ok: condition, detail });
  const marker = condition ? "✓" : "✗";
  console.log(`${marker} ${label}${detail ? ` - ${detail}` : ""}`);
  if (!condition) {
    throw new Error(label);
  }
}

async function getInventory(workshopId: string, sku: string) {
  const row = await prisma.workshopInventory.findUnique({
    where: { workshopId_sku: { workshopId, sku } },
  });
  return row?.quantity ?? 0;
}

async function dealerStatement(dealerId: string) {
  const orders = await prisma.salesOrder.findMany({
    where: {
      dealerId,
      orderStatus: {
        in: ["CONFIRMED", "PARTIALLY_PAID", "PRODUCING", "READY", "SHIPPED", "COMPLETED"],
      },
    },
    select: { totalAmount: true },
  });
  const payments = await prisma.dealerPayment.findMany({
    where: { dealerId },
    select: { amount: true },
  });
  const receivable = orders.reduce((sum, order) => sum.add(order.totalAmount), money(0));
  const paid = payments.reduce((sum, payment) => sum.add(payment.amount), money(0));
  return { receivable, paid, balance: receivable.sub(paid) };
}

async function supplierStatement(supplierId: string) {
  const pos = await prisma.purchaseOrder.findMany({
    where: { supplierId, status: { not: "CANCELLED" } },
    include: { lines: true },
  });
  const payments = await prisma.supplierPayment.findMany({
    where: { supplierId },
    select: { amount: true },
  });
  const payable = pos.reduce((sum, po) => {
    const received = po.lines.reduce(
      (lineSum, line) => lineSum.add(line.unitPrice.mul(line.receivedQty)),
      money(0),
    );
    return sum.add(received);
  }, money(0));
  const paid = payments.reduce((sum, payment) => sum.add(payment.amount), money(0));
  return { payable, paid, balance: payable.sub(paid) };
}

async function moveWorkOrderTo(
  workOrderNo: string,
  toStatus: WorkOrderStatus,
  operator: { id: string; name: string },
) {
  const wo = await prisma.workOrder.findUnique({ where: { workOrderNo } });
  if (!wo) throw new Error(`WorkOrder not found: ${workOrderNo}`);
  if (wo.status === toStatus) return wo;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id: wo.id },
      data: { status: toStatus, currentNote: `smoke advance to ${toStatus}` },
    });

    await tx.workOrderEvent.create({
      data: {
        workOrderId: wo.id,
        fromStatus: wo.status,
        toStatus,
        note: `smoke advance to ${toStatus}`,
        operatorUserId: operator.id,
        operatorName: operator.name,
      },
    });

    await tx.salesOrder.update({
      where: { orderNo: wo.orderNo },
      data: { orderStatus: toStatus === "PACKING" ? "READY" : "PRODUCING" },
    });

    if (toStatus === "PACKING") {
      const alreadyConsumed = await tx.stockMovement.count({
        where: { refType: "WO", refNo: wo.workOrderNo, type: "WORK_ORDER_CONSUME" },
      });

      if (alreadyConsumed === 0) {
        const lines = await tx.salesOrderLine.findMany({
          where: { orderNo: wo.orderNo, lineType: { not: "OUTSOURCED" } },
        });
        const hardware = new Map<string, { sku: string; productName: string; qty: number }>();
        const rawProfile = new Map<string, { productId: string; totalMm: number }>();

        for (const line of lines) {
          if (line.lineType === "HARDWARE") {
            const existing = hardware.get(line.sku) ?? {
              sku: line.sku,
              productName: line.productName,
              qty: 0,
            };
            existing.qty += line.quantity;
            hardware.set(line.sku, existing);
          }

          if (line.lineType === "PROFILE" && line.rawProductId && line.cutLengthMm) {
            const existing = rawProfile.get(line.rawProductId) ?? {
              productId: line.rawProductId,
              totalMm: 0,
            };
            existing.totalMm += line.cutLengthMm * line.quantity;
            rawProfile.set(line.rawProductId, existing);
          }
        }

        for (const item of hardware.values()) {
          await applyStockMovement(tx, {
            workshopId: wo.workshopId,
            sku: item.sku,
            productName: item.productName,
            delta: -item.qty,
            type: "WORK_ORDER_CONSUME",
            refType: "WO",
            refNo: wo.workOrderNo,
            note: "smoke PACKING hardware consume",
            operatorName: operator.name,
          });
        }

        for (const item of rawProfile.values()) {
          const raw = await tx.product.findUnique({ where: { id: item.productId } });
          if (!raw) throw new Error(`Raw profile product not found: ${item.productId}`);
          const barMm = Number(raw.lengthMm ?? 3600);
          const yieldRate = Number(raw.yieldRate ?? 0.95);
          const bars = Math.ceil(item.totalMm / barMm / yieldRate);
          await applyStockMovement(tx, {
            workshopId: wo.workshopId,
            sku: raw.sku,
            productName: raw.productName,
            delta: -bars,
            type: "WORK_ORDER_CONSUME",
            refType: "WO",
            refNo: wo.workOrderNo,
            note: `smoke PACKING profile consume ${item.totalMm}mm / ${barMm}mm / ${yieldRate} => ${bars} bars`,
            operatorName: operator.name,
          });
        }
      }
    }

    return updated;
  }, TX_OPTIONS);
}

async function main() {
  const suffix = `${Date.now()}`;
  const now = new Date();
  const targetDeliveryDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const adminName = `Smoke Admin ${suffix}`;
  const workshopName = `Smoke Workshop ${suffix}`;

  console.log(`Smoke E2E run suffix: ${suffix}`);

  const workshop = await prisma.workshop.create({
    data: {
      code: `SMW-${suffix}`,
      name: workshopName,
      contactName: "Smoke",
      contactPhone: "13000000000",
      address: "Smoke address",
    },
  });
  const supplier = await prisma.supplier.create({
    data: {
      supplierNo: `SMS-${suffix}`,
      name: `Smoke Supplier ${suffix}`,
      contactName: "Smoke Supplier",
      contactPhone: "13100000000",
    },
  });
  const dealer = await prisma.dealer.create({
    data: {
      dealerNo: `SMD-${suffix}`,
      companyName: `Smoke Dealer ${suffix}`,
      contactName: "Smoke Dealer",
      contactPhone: "13200000000",
      priceLevel: "A",
      creditLimit: money(100000),
      creditBalance: money(100000),
      paymentMethod: "CREDIT",
    },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}@smoke.local`,
      name: adminName,
      password: "smoke-not-for-login",
      role: "ADMIN",
    },
  });
  const workshopUser = await prisma.user.create({
    data: {
      email: `workshop-${suffix}@smoke.local`,
      name: `Smoke Workshop User ${suffix}`,
      password: "smoke-not-for-login",
      role: "WORKSHOP",
      workshopId: workshop.id,
    },
  });
  const dealerUser = await prisma.user.create({
    data: {
      email: `dealer-${suffix}@smoke.local`,
      name: `Smoke Dealer User ${suffix}`,
      password: "smoke-not-for-login",
      role: "DEALER",
      dealerId: dealer.id,
    },
  });

  check("Phase A setup created dealer/supplier/workshop/users", Boolean(workshop.id && supplier.id && dealer.id));

  const rawProfile = await prisma.product.create({
    data: {
      sku: `RAW-${suffix}`,
      productName: `Smoke Raw Profile ${suffix}`,
      series: "SMOKE",
      category: "PROFILE",
      lengthMm: money(3600),
      retailPrice: money(120),
      purchasePrice: money(80),
      unit: "根",
      spec: "6063-T5 3600mm",
      isRawMaterial: true,
      yieldRate: money(0.95),
    },
  });
  const hardware = await prisma.product.create({
    data: {
      sku: `HW-${suffix}`,
      productName: `Smoke Hardware ${suffix}`,
      series: "SMOKE",
      category: "HARDWARE",
      retailPrice: money(50),
      purchasePrice: money(5),
      unit: "件",
      spec: "smoke hardware",
    },
  });
  check("Phase A products created PROFILE raw material + HARDWARE", Boolean(rawProfile.id && hardware.id));

  const poNo = stampNo("PO", suffix);
  const po = await prisma.purchaseOrder.create({
    data: {
      poNo,
      supplierId: supplier.id,
      workshopId: workshop.id,
      status: "DRAFT",
      expectedDate: targetDeliveryDate,
      totalAmount: money(900),
      remark: "smoke PO",
      createdBy: admin.name,
      lines: {
        create: [
          {
            lineNo: 1,
            sku: rawProfile.sku,
            productName: rawProfile.productName,
            spec: rawProfile.spec,
            quantity: 10,
            unitPrice: money(80),
            lineAmount: money(800),
          },
          {
            lineNo: 2,
            sku: hardware.sku,
            productName: hardware.productName,
            spec: hardware.spec,
            quantity: 20,
            unitPrice: money(5),
            lineAmount: money(100),
          },
        ],
      },
    },
    include: { lines: true },
  });
  check("Phase A purchase order created", po.lines.length === 2, po.poNo);

  await prisma.$transaction(async (tx) => {
    for (const line of po.lines) {
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { receivedQty: line.quantity },
      });
      await applyStockMovement(tx, {
        workshopId: workshop.id,
        sku: line.sku,
        productName: line.productName,
        delta: line.quantity,
        type: "PO_RECEIPT",
        refType: "PO",
        refNo: po.poNo,
        note: "smoke receive full PO",
        operatorName: admin.name,
      });
    }
    await tx.purchaseOrder.update({ where: { poNo: po.poNo }, data: { status: "RECEIVED" } });
  }, TX_OPTIONS);
  check("Phase A PO receive increments raw profile bars", (await getInventory(workshop.id, rawProfile.sku)) === 10);
  check("Phase A PO receive increments hardware stock", (await getInventory(workshop.id, hardware.sku)) === 20);

  const orderNo = stampNo("SO", suffix);
  const profileQty = 3;
  const profileCutMm = 1200;
  const hardwareQty = 4;
  const outsourcedQty = 2;
  const orderTotal = money(960);

  const order = await prisma.salesOrder.create({
    data: {
      orderNo,
      dealerId: dealer.id,
      targetDeliveryDate,
      dealerAccount: dealerUser.email,
      receiverName: "Smoke Receiver",
      receiverPhone: "13300000000",
      receiverAddress: "Smoke receiver address",
      totalAmount: orderTotal,
      orderStatus: "DRAFT",
      paymentStatus: "UNPAID",
      remark: "smoke dealer order",
      lines: {
        create: [
          {
            lineNo: 1,
            lineType: "PROFILE",
            sku: `CUT-${suffix}`,
            productName: `Smoke Cut Profile ${suffix}`,
            rawProductId: rawProfile.id,
            cutLengthMm: profileCutMm,
            lengthMm: money(profileCutMm),
            surfaceTreatment: "anodized",
            preprocessing: "cut",
            spec: "1200mm custom",
            quantity: profileQty,
            unitPrice: money(200),
            lineAmount: money(600),
            isCustom: true,
          },
          {
            lineNo: 2,
            lineType: "HARDWARE",
            sku: hardware.sku,
            productName: hardware.productName,
            productId: hardware.id,
            spec: hardware.spec,
            quantity: hardwareQty,
            unitPrice: money(50),
            lineAmount: money(200),
          },
          {
            lineNo: 3,
            lineType: "OUTSOURCED",
            sku: `OUT-${suffix}`,
            productName: `Smoke Outsourced ${suffix}`,
            spec: "outsourced item",
            quantity: outsourcedQty,
            unitPrice: money(80),
            lineAmount: money(160),
          },
        ],
      },
    },
    include: { lines: true },
  });
  check("Phase B dealer order created with PROFILE+HARDWARE+OUTSOURCED lines", order.lines.length === 3, order.orderNo);

  await prisma.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { orderNo: order.orderNo },
      data: {
        orderStatus: "CONFIRMED",
        confirmedAmount: order.totalAmount,
        paymentStatus: "CREDIT",
        reviewer: admin.name,
        reviewTime: now,
        reviewRemark: "smoke admin confirm",
      },
    });
    await tx.dealer.update({
      where: { id: dealer.id },
      data: {
        usedCredit: { increment: orderTotal },
        creditBalance: { decrement: orderTotal },
      },
    });
  }, TX_OPTIONS);
  const confirmed = await prisma.salesOrder.findUnique({ where: { orderNo: order.orderNo } });
  check("Phase B admin confirmed dealer order", confirmed?.orderStatus === "CONFIRMED");
  const dealerAfterConfirm = await prisma.dealer.findUnique({ where: { id: dealer.id } });
  check("Phase B credit approval occupies dealer credit", Number(dealerAfterConfirm?.usedCredit ?? 0) === Number(orderTotal));

  const workOrderNo = stampNo("WO", suffix);
  const workOrder = await prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: {
        workOrderNo,
        orderNo: order.orderNo,
        workshopId: workshop.id,
        status: "SCHEDULED",
        committedDeliveryDate: targetDeliveryDate,
        qcRequired: true,
        currentNote: "smoke dispatch",
        assignedBy: admin.name,
      },
    });
    await tx.workOrderEvent.create({
      data: {
        workOrderId: created.id,
        fromStatus: null,
        toStatus: "SCHEDULED",
        note: `smoke dispatched to ${workshop.name}`,
        operatorUserId: admin.id,
        operatorName: admin.name,
      },
    });
    await tx.salesOrder.update({
      where: { orderNo: order.orderNo },
      data: { orderStatus: "PRODUCING" },
    });
    return created;
  }, TX_OPTIONS);
  check("Phase B admin dispatched confirmed order to WorkOrder", workOrder.status === "SCHEDULED", workOrder.workOrderNo);

  for (const status of ["PREPARING", "PROCESSING", "QC", "PACKING"] as WorkOrderStatus[]) {
    await moveWorkOrderTo(workOrder.workOrderNo, status, { id: workshopUser.id, name: workshopUser.name });
  }

  const expectedProfileBars = Math.ceil((profileQty * profileCutMm) / Number(rawProfile.lengthMm ?? 3600) / Number(rawProfile.yieldRate ?? 0.95));
  const rawAfterPacking = await getInventory(workshop.id, rawProfile.sku);
  const hardwareAfterPacking = await getInventory(workshop.id, hardware.sku);
  check("Phase C WorkOrder reached PACKING", (await prisma.workOrder.findUnique({ where: { workOrderNo } }))?.status === "PACKING");
  check(
    "Phase C PACKING decremented HARDWARE inventory",
    hardwareAfterPacking === 20 - hardwareQty,
    `${hardware.sku}: ${hardwareAfterPacking}`,
  );
  check(
    "Phase C PACKING decremented PROFILE raw bars",
    rawAfterPacking === 10 - expectedProfileBars,
    `${rawProfile.sku}: ${rawAfterPacking}, expected bars ${expectedProfileBars}`,
  );
  check(
    "Phase C OUTSOURCED line did not create inventory consumption",
    (await prisma.stockMovement.count({
      where: { refType: "WO", refNo: workOrder.workOrderNo, type: "WORK_ORDER_CONSUME" },
    })) === 2,
  );

  const countNo = stampNo("SC", suffix);
  const inventorySnapshot = await prisma.workshopInventory.findMany({
    where: { workshopId: workshop.id },
    orderBy: { sku: "asc" },
  });
  const stockCount = await prisma.stockCount.create({
    data: {
      countNo,
      workshopId: workshop.id,
      status: "DRAFT",
      remark: "smoke stock count",
      lines: {
        create: inventorySnapshot.map((item) => ({
          sku: item.sku,
          productName: item.productName,
          systemQty: item.quantity,
          actualQty: item.quantity,
          diff: 0,
        })),
      },
    },
    include: { lines: true },
  });
  check("Phase C stock count draft snapshots current inventory", stockCount.lines.length >= 2, stockCount.countNo);

  const hardwareLine = stockCount.lines.find((line) => line.sku === hardware.sku);
  if (!hardwareLine) throw new Error("Stock count hardware line missing");
  await prisma.stockCountLine.update({
    where: { id: hardwareLine.id },
    data: {
      actualQty: hardwareLine.systemQty + 3,
      diff: 3,
    },
  });

  await prisma.stockCount.update({
    where: { countNo: stockCount.countNo },
    data: {
      status: "SUBMITTED",
      submittedBy: workshopUser.name,
      submittedAt: now,
    },
  });
  check("Phase C stock count submit does not adjust inventory before approval", (await getInventory(workshop.id, hardware.sku)) === hardwareAfterPacking);

  await prisma.$transaction(async (tx) => {
    const sc = await tx.stockCount.findUnique({ where: { countNo: stockCount.countNo }, include: { lines: true } });
    if (!sc) throw new Error("Stock count missing before approve");
    if (sc.status !== "SUBMITTED") throw new Error(`Expected SUBMITTED stock count, got ${sc.status}`);
    for (const line of sc.lines) {
      if (line.diff === 0) continue;
      await applyStockMovement(tx, {
        workshopId: sc.workshopId,
        sku: line.sku,
        productName: line.productName,
        delta: line.diff,
        type: "STOCK_COUNT_ADJUST",
        refType: "SC",
        refNo: sc.countNo,
        note: `smoke stock count ${line.systemQty} -> ${line.actualQty}`,
        operatorName: admin.name,
      });
    }
    await tx.stockCount.update({
      where: { countNo: sc.countNo },
      data: {
        status: "APPROVED",
        approvedBy: admin.name,
        approvedAt: now,
      },
    });
  }, TX_OPTIONS);
  check("Phase C admin approval applies stock count adjustment", (await getInventory(workshop.id, hardware.sku)) === hardwareAfterPacking + 3);
  check(
    "Phase C adjustment movement recorded",
    (await prisma.stockMovement.count({
      where: { refType: "SC", refNo: stockCount.countNo, type: "STOCK_COUNT_ADJUST", quantity: 3 },
    })) === 1,
  );

  let negativeBlocked = false;
  try {
    await applyStockMovement(prisma, {
      workshopId: workshop.id,
      sku: `MISSING-${suffix}`,
      productName: "Smoke Missing Stock",
      delta: -1,
      type: "MANUAL_ADJUST",
      refType: "SMOKE",
      refNo: suffix,
      note: "negative stock guard check",
      operatorName: admin.name,
    });
  } catch {
    negativeBlocked = true;
  }
  check("Phase C negative stock movement is blocked", negativeBlocked);

  const dealerPaymentAmount = money(300);
  const supplierPaymentAmount = money(450);
  await prisma.$transaction(async (tx) => {
    const payment = await tx.dealerPayment.create({
      data: {
        dealerId: dealer.id,
        amount: dealerPaymentAmount,
        paidAt: now,
        method: "BANK",
        refNo: `DP-${suffix}`,
        note: "smoke dealer payment",
        recordedBy: admin.name,
      },
    });
    await tx.dealerPaymentAllocation.create({
      data: {
        paymentId: payment.id,
        orderNo: order.orderNo,
        amount: dealerPaymentAmount,
      },
    });
    await tx.salesOrder.update({
      where: { orderNo: order.orderNo },
      data: {
        paidAmount: { increment: dealerPaymentAmount },
        paymentStatus: "PARTIAL",
      },
    });
    await tx.dealer.update({
      where: { id: dealer.id },
      data: {
        usedCredit: { decrement: dealerPaymentAmount },
        creditBalance: { increment: dealerPaymentAmount },
      },
    });
  }, TX_OPTIONS);
  const dealerAfterPayment = await prisma.dealer.findUnique({ where: { id: dealer.id } });
  check("Phase D dealer payment releases occupied credit", Number(dealerAfterPayment?.usedCredit ?? 0) === Number(orderTotal.sub(dealerPaymentAmount)));
  const orderAfterPayment = await prisma.salesOrder.findUnique({ where: { orderNo: order.orderNo } });
  check("Phase D dealer payment allocates to receivable order", Number(orderAfterPayment?.paidAmount ?? 0) === Number(dealerPaymentAmount));
  check("Phase D partial allocation updates order payment status", orderAfterPayment?.paymentStatus === "PARTIAL");
  await prisma.$transaction(async (tx) => {
    const payment = await tx.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        amount: supplierPaymentAmount,
        paidAt: now,
        method: "BANK",
        refNo: `SP-${suffix}`,
        note: "smoke supplier payment",
        recordedBy: admin.name,
      },
    });
    await tx.supplierPaymentAllocation.create({
      data: {
        paymentId: payment.id,
        poNo: po.poNo,
        amount: supplierPaymentAmount,
      },
    });
    await tx.purchaseOrder.update({
      where: { poNo: po.poNo },
      data: { paidAmount: { increment: supplierPaymentAmount } },
    });
  }, TX_OPTIONS);
  const poAfterPayment = await prisma.purchaseOrder.findUnique({ where: { poNo: po.poNo } });
  check("Phase D supplier payment allocates to received purchase order", Number(poAfterPayment?.paidAmount ?? 0) === Number(supplierPaymentAmount));

  const dealerBalance = await dealerStatement(dealer.id);
  const supplierBalance = await supplierStatement(supplier.id);
  check("Phase D dealer payment recorded", dealerBalance.paid.eq(dealerPaymentAmount), `paid ${dealerBalance.paid.toFixed(2)}`);
  check(
    "Phase D dealer statement balance is receivable minus paid",
    dealerBalance.balance.eq(orderTotal.sub(dealerPaymentAmount)),
    `balance ${dealerBalance.balance.toFixed(2)}`,
  );
  check("Phase D supplier payment recorded", supplierBalance.paid.eq(supplierPaymentAmount), `paid ${supplierBalance.paid.toFixed(2)}`);
  check(
    "Phase D supplier statement balance is received payable minus paid",
    supplierBalance.balance.eq(money(900).sub(supplierPaymentAmount)),
    `balance ${supplierBalance.balance.toFixed(2)}`,
  );

  console.log(`\nSmoke E2E passed: ${results.length} assertions`);
}

main()
  .catch((error) => {
    console.error(`\nSmoke E2E failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

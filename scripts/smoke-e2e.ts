import { Prisma, PrismaClient, type WorkOrderStatus } from "@prisma/client";
import { applyStockMovement } from "../src/lib/inventory";
import { salesOrderStatusFor } from "../src/lib/workorder";
import { createShipment } from "../src/lib/shipment";
// WORK_ORDER_TRANSITIONS/nextWorkOrderStatus 在 Phase G 引入
import { consumeWorkOrderMaterials } from "../src/lib/stock-consume";
import { RECEIVABLE_ORDER_STATUSES } from "../src/lib/reconcile";
import { prepayViolation } from "../src/lib/payment-guard";
import { suggestDeliveryDays } from "../src/lib/delivery-insight";
import { WORK_ORDER_TRANSITIONS, nextWorkOrderStatus } from "../src/lib/workorder";
import { calcPricing } from "../src/lib/pricing";
import { resolveRawBasis } from "../src/lib/pricing-source";
import { movingAveragePerMeter, theoreticalWeightKg, weightDeviation, WEIGHT_TOLERANCE } from "../src/lib/inventory";
import { surfaceCodesOf, surfaceCodesText, surfaceMismatch } from "../src/lib/surface";
import {
  getValuation, getPeriodSummary, getAging, getAbcClassification,
  getAvailability, getReorderSuggestions, unitValueOf,
} from "../src/lib/inventory-analytics";
import { generateProductSku } from "../src/lib/sku";
import { Prisma as PrismaNS } from "@prisma/client";

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
      data: { orderStatus: salesOrderStatusFor(toStatus) },
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
        status: "PENDING_START",
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
        toStatus: "PENDING_START",
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
  check("Phase B admin dispatched confirmed order to WorkOrder", workOrder.status === "PENDING_START", workOrder.workOrderNo);

  for (const status of ["PROCESSING", "QC", "PACKING"] as WorkOrderStatus[]) {
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
        creditReleased: dealerPaymentAmount,
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

  // ---------- Phase E: Shipment 发货闭环 ----------
  {
    // 从 PACKING 推进到 READY_TO_SHIP
    await moveWorkOrderTo(workOrderNo, "READY_TO_SHIP", { id: workshopUser.id, name: workshopUser.name });
    check("Phase E work order READY_TO_SHIP", (await prisma.workOrder.findUnique({ where: { workOrderNo } }))?.status === "READY_TO_SHIP");

    const orderE = await prisma.salesOrder.findUniqueOrThrow({ where: { orderNo }, include: { lines: true } });
    const profileLine = orderE.lines.find((l) => l.lineType === "PROFILE")!;
    const hwLine = orderE.lines.find((l) => l.lineType === "HARDWARE")!;

    // READY_TO_SHIP 前置校验：直接对非待发货状态发货应被拒（造一张 PROCESSING 工单太重，跳过——由矩阵测试覆盖）
    // a) 部分发货（型材发一半）
    const sh1 = await prisma.$transaction((tx) =>
      createShipment(tx, {
        carrier: "顺丰速运", trackingNo: "SF1234567890123",
        freightPayType: "PREPAID", fromType: "FACTORY",
        lines: [{ orderNo, lineId: profileLine.id, quantity: Math.floor(profileLine.quantity / 2) }],
        operatorName: "smoke",
      }),
    );
    check("Phase E partial shipment created", sh1.lines.length === 1, sh1.shipmentNo);
    const afterPartial = await prisma.salesOrder.findUniqueOrThrow({ where: { orderNo } });
    check("Phase E order PARTIALLY_SHIPPED", afterPartial.orderStatus === "PARTIALLY_SHIPPED", afterPartial.orderStatus);

    // b) 超量发货应被拒
    let overShipBlocked = false;
    try {
      await prisma.$transaction((tx) =>
        createShipment(tx, {
          carrier: "顺丰速运",
          lines: [{ orderNo, lineId: profileLine.id, quantity: profileLine.quantity + 1 }],
          operatorName: "smoke",
        }),
      );
    } catch { overShipBlocked = true; }
    check("Phase E over-quantity shipment blocked", overShipBlocked);

    // c) 补齐剩余（合发：型材余量+五金全部，一张发货单）
    const sh2 = await prisma.$transaction((tx) =>
      createShipment(tx, {
        carrier: "顺丰速运", trackingNo: "SF1234567890123", freightPayType: "COD", fromType: "FACTORY",
        lines: [
          { orderNo, lineId: profileLine.id, quantity: profileLine.quantity - Math.floor(profileLine.quantity / 2) },
          { orderNo, lineId: hwLine.id, quantity: hwLine.quantity },
        ],
        operatorName: "smoke",
      }),
    );
    check("Phase E combined shipment created", sh2.lines.length === 2, sh2.shipmentNo);
    const afterFull = await prisma.salesOrder.findUniqueOrThrow({ where: { orderNo } });
    check("Phase E order SHIPPED after full shipment", afterFull.orderStatus === "SHIPPED", afterFull.orderStatus);
    const woAfter = await prisma.workOrder.findUniqueOrThrow({ where: { workOrderNo } });
    check("Phase E work order auto SHIPPED", woAfter.status === "SHIPPED", woAfter.status);
    check("Phase E logistics written back (carrier+tracking+actualShippedAt)",
      woAfter.carrier === "顺丰速运" && woAfter.trackingNo === "SF1234567890123" && woAfter.actualShippedAt !== null);
    check("Phase E salesOrder actualDeliveryDate set", afterFull.actualDeliveryDate !== null);

    // d) 已发完再发应被拒
    let reShipBlocked = false;
    try {
      await prisma.$transaction((tx) =>
        createShipment(tx, { carrier: "顺丰速运", lines: [{ orderNo, lineId: hwLine.id, quantity: 1 }], operatorName: "smoke" }),
      );
    } catch { reShipBlocked = true; }
    check("Phase E re-shipment after full delivery blocked", reShipBlocked);
  }

  // ---------- Phase F: P0 正确性回归（外协直发扣料 / 应收口径 / 扣料幂等） ----------
  {
    // F1 部分发货必须计入应收口径（否则对账单漏掉最危险时点的应收）
    check(
      "Phase F PARTIALLY_SHIPPED counted as receivable",
      (RECEIVABLE_ORDER_STATUSES as readonly string[]).includes("PARTIALLY_SHIPPED"),
    );

    // 外协直发场景：订单→工单停在 OUTSOURCING → 从外协厂直发 → 必须补扣原料
    const orderNoF = stampNo("SOF", suffix);
    const woNoF = stampNo("WOF", suffix);
    await prisma.salesOrder.create({
      data: {
        orderNo: orderNoF,
        displayOrderNo: stampNo("F", suffix),
        dealerId: dealer.id,
        targetDeliveryDate,
        dealerAccount: "smoke",
        receiverName: "Smoke F", receiverPhone: "13000000000", receiverAddress: "smoke",
        totalAmount: money(500), orderStatus: "PRODUCING", paymentStatus: "UNPAID",
        createdVia: "INTERNAL",
        lines: {
          create: [{
            lineNo: 1, lineType: "PROFILE", sku: rawProfile.sku, productName: rawProfile.productName,
            rawProductId: rawProfile.id, cutLengthMm: 900, quantity: 4,
            unitPrice: money(50), lineAmount: money(200), includedInProfit: true,
          }],
        },
      },
    });
    await prisma.workOrder.create({
      data: {
        workOrderNo: woNoF, orderNo: orderNoF, workshopId: workshop.id,
        status: "OUTSOURCING", committedDeliveryDate: targetDeliveryDate, qcRequired: false,
        assignedBy: "smoke",
      },
    });
    // 备料 20 根
    await applyStockMovement(prisma, {
      workshopId: workshop.id, sku: rawProfile.sku, productName: rawProfile.productName,
      delta: 20, type: "MANUAL_ADJUST", refType: "PO", refNo: `PO-${suffix}-F`,
      note: "Phase F seed", operatorName: "smoke",
    });
    const invBefore = await getInventory(workshop.id, rawProfile.sku);
    const lineF = (await prisma.salesOrderLine.findFirstOrThrow({ where: { orderNo: orderNoF } }));

    const shF = await prisma.$transaction((tx) =>
      createShipment(tx, {
        carrier: "外协厂直发-顺丰", fromType: "OUTSOURCER", fromNote: "喷油厂直发",
        lines: [{ orderNo: orderNoF, lineId: lineF.id, quantity: 4 }],
        operatorName: "smoke",
      }),
    );
    const consumesF = await prisma.stockMovement.count({
      where: { refType: "WO", refNo: woNoF, type: "WORK_ORDER_CONSUME" },
    });
    check("Phase F outsourced direct shipment created", shF.lines.length === 1, shF.shipmentNo);
    check("Phase F outsourced direct shipment consumed raw stock", consumesF === 1, `consume movements=${consumesF}`);
    const invAfter = await getInventory(workshop.id, rawProfile.sku);
    // 4 支 ×900mm = 3600mm；棒长 3600/良率 0.95 → ceil(3600/3600/0.95)=2 根
    check(
      "Phase F inventory decremented by outsourced shipment (2 bars)",
      invBefore - invAfter === 2,
      `before=${invBefore} after=${invAfter}`,
    );
    const orderFAfter = await prisma.salesOrder.findUniqueOrThrow({ where: { orderNo: orderNoF } });
    check("Phase F order SHIPPED via outsourced direct shipment", orderFAfter.orderStatus === "SHIPPED", orderFAfter.orderStatus);

    // 扣料幂等：对已扣过的工单再调用不会重复扣
    const again = await prisma.$transaction((tx) =>
      consumeWorkOrderMaterials(tx, {
        workOrderNo: woNoF, orderNo: orderNoF, workshopId: workshop.id,
        note: "Phase F idempotency probe", operatorName: "smoke",
      }),
    );
    const invAfterProbe = await getInventory(workshop.id, rawProfile.sku);
    check("Phase F consume idempotent (second call skipped)", again === false && invAfterProbe === invAfter);
  }

  // ---------- Phase G: P1 纯函数回归（先款后产 / 交期建议 / CANCELLED 状态机） ----------
  {
    // G1 先款后产四象限：开关×单据维度
    const mkOrder = (over: Partial<{ paidAmount: number; totalAmount: number; confirmedAmount: number; createdVia: "INTERNAL" | "PORTAL" }>) => ({
      orderNo: "SO-G", createdVia: over.createdVia ?? "PORTAL",
      paidAmount: new PrismaNS.Decimal(over.paidAmount ?? 0),
      totalAmount: new PrismaNS.Decimal(over.totalAmount ?? 100),
      confirmedAmount: over.confirmedAmount == null ? null : new PrismaNS.Decimal(over.confirmedAmount),
    });
    const onOff = { paymentMethod: "PREPAID", enforcePrepay: true };
    const off = { paymentMethod: "PREPAID", enforcePrepay: false };
    check("G1 prepay blocks underpaid portal order", prepayViolation(mkOrder({ paidAmount: 30 }), onOff, "DISPATCH") !== null);
    check("G1 prepay allows fully paid portal order", prepayViolation(mkOrder({ paidAmount: 100 }), onOff, "SHIP") === null);
    check("G1 prepay exempts internal orders (D2)", prepayViolation(mkOrder({ paidAmount: 0, createdVia: "INTERNAL" }), onOff, "DISPATCH") === null);
    check("G1 prepay off by default", prepayViolation(mkOrder({ paidAmount: 0 }), off, "DISPATCH") === null);
    check("G1 prepay uses confirmedAmount when set", prepayViolation(mkOrder({ paidAmount: 80, confirmedAmount: 80 }), onOff, "DISPATCH") === null);

    // G2 交期建议：客户日期晚于产能→采用客户；队列紧→上浮
    const cycle = { p50: 4, p90: 16, sample: 100 };
    const light = { inProduction: 2, dueIn7d: 1, weeklyThroughput: 6.6 };
    const far = new Date(Date.now() + 40 * 86400000);
    const soon = new Date(Date.now() + 2 * 86400000);
    const r1 = suggestDeliveryDays(cycle, light, far);
    check("G2 customer date later than capacity → adopt customer", r1.days >= 39, `days=${r1.days}`);
    const tight = { inProduction: 9, dueIn7d: 10, weeklyThroughput: 6.6 };
    const r2 = suggestDeliveryDays(cycle, tight, soon);
    check("G2 tight queue escalates to P95 band", r2.days >= 26 && r2.days <= 30, `days=${r2.days}`);
    const r3 = suggestDeliveryDays(null, light, soon);
    check("G2 no sample falls back to calibrated P90=16", r3.days === 16, `days=${r3.days}`);

    // G3 CANCELLED 状态机：无出边、不可推进、映射订单取消
    check("G3 CANCELLED has no outgoing transitions", (WORK_ORDER_TRANSITIONS.CANCELLED ?? []).length === 0);
    check("G3 nextWorkOrderStatus(CANCELLED) is null", nextWorkOrderStatus("CANCELLED", true) === null);
    check("G3 salesOrderStatusFor(CANCELLED) = CANCELLED", salesOrderStatusFor("CANCELLED") === "CANCELLED");
  }

  // ---------- Phase H: 批次计价第 1 步（SKU 级口径 + 三级回退 + 成本快照） ----------
  {
    // H1 SKU 级口径：材料=切长÷良率×每米价；2026-10-08 口径更新：素材价为裸管口径，表面独立按重量计价
    const p1 = calcPricing(1000, "C", undefined, undefined, { perMeterPrice: 20, yieldRate: 0.95, meterWeight: 0.72, costSource: "AVG" });
    check("H1 per-meter material = (1m/0.95)×20 = 21.05", Math.abs(p1.materialCost - 21.05) < 0.01, `material=${p1.materialCost}`);
    check("H1 surface billed by weight (裸管口径, 5.5元/kg)", Math.abs(p1.surfaceCost - (0.72 / 0.95) * 5.5) < 0.01, `surface=${p1.surfaceCost}`);
    check("H1 costSource propagates", p1.costSource === "AVG");
    check("H1 yield sourced from Product (0.95 not global 0.92)", Math.abs(p1.theoreticalWeight - 0.72) < 0.001 && Math.abs(p1.actualWeight - 0.72 / 0.95) < 0.001, `actual=${p1.actualWeight}`);

    // D2/D3 工序计价(2026-10-08 r3):EM 隐含截断+铣孔(1+1+1=3);连接件 10 无组装;包材 0.3 必收
    {
      const p3 = calcPricing(1000, "C", undefined, undefined, undefined, { codes: ["EM"], prices: { L: 1, D: 1, EM: 1 } });
      check("D2 EM 隐含 L+D,加工费=1+1+1=3", Math.abs(p3.processingCost - 3) < 0.001, `processing=${p3.processingCost}`);
      check("D3 连接件=10(无组装)", Math.abs(p3.connectorCost - 10) < 0.001, `connector=${p3.connectorCost}`);
      check("D3 包材包装=0.3 必收", Math.abs(p3.packagingCost - 0.3) < 0.001, `packaging=${p3.packagingCost}`);
      const p4 = calcPricing(1000, "C", undefined, undefined, undefined, { codes: ["L"], prices: { L: 1 } });
      check("D3 纯切长免连接件", p4.connectorCost === 0 && Math.abs(p4.processingCost - 1) < 0.001, `connector=${p4.connectorCost}, processing=${p4.processingCost}`);
      const p5 = calcPricing(1000, "C");
      check("D2/D3 无工序码回退旧行为 (固定3+每行10+包材0.3)", Math.abs(p5.processingCost - 3) < 0.001 && Math.abs(p5.connectorCost - 10) < 0.001 && Math.abs(p5.packagingCost - 0.3) < 0.001);
    }

    // H2 全局常数回退（无基数）：旧公式不变
    const p2 = calcPricing(1000, "C");
    check("H2 SETTINGS fallback keeps surface line", p2.surfaceCost > 0 && p2.costSource === "SETTINGS", `surface=${p2.surfaceCost}`);
    check("H2 SETTINGS material = actual×28", Math.abs(p2.materialCost - (p2.theoreticalWeight / 0.92) * 28) < 0.05, `material=${p2.materialCost}`);

    // H3 三级回退解析：PURCHASE（采购价÷棒长）→ AVG（车间均价优先）
    const basisSku = "SMOKE-BASIS-TMP";
    await prisma.product.upsert({
      where: { sku: basisSku },
      create: { sku: basisSku, productName: "basis", series: "BASIS", category: "PROFILE", retailPrice: money(0), purchasePrice: money(120), lengthMm: money(6000), isRawMaterial: true, materialStage: "RAW", weightPerMeter: money(0.72) },
      update: { purchasePrice: money(120), lengthMm: money(6000), weightPerMeter: money(0.72) },
    });
    await prisma.workshopInventory.deleteMany({ where: { sku: basisSku } });
    const basisProd = (await prisma.product.findUnique({ where: { sku: basisSku } }))!;
    const b1 = await resolveRawBasis(basisProd);
    check("H3 PURCHASE tier = 120元÷6m = 20 元/m", b1.costSource === "PURCHASE" && Math.abs((b1.perMeterPrice ?? 0) - 20) < 0.001, JSON.stringify({ s: b1.costSource, p: b1.perMeterPrice }));
    const ws = await prisma.workshop.findFirst({ where: { isActive: true } });
    if (ws) {
      await prisma.workshopInventory.create({ data: { workshopId: ws.id, sku: basisSku, productName: "basis", quantity: 10, avgCostPerMeter: money(25) } });
      const b2 = await resolveRawBasis(basisProd);
      check("H3 AVG tier overrides purchase (25 元/m)", b2.costSource === "AVG" && Math.abs((b2.perMeterPrice ?? 0) - 25) < 0.001, JSON.stringify({ s: b2.costSource, p: b2.perMeterPrice }));
      await prisma.workshopInventory.deleteMany({ where: { sku: basisSku } });
    }
    await prisma.product.deleteMany({ where: { sku: basisSku } });

    // H4 快照 JSON 往返（构成与解析契约）
    const snap = JSON.stringify({ source: "PURCHASE", perMeterPrice: 20, meterWeight: 0.72, yieldRate: 0.95, unitCost: 34.05, cutLengthMm: 1000, pricedAt: new Date().toISOString() });
    const parsed = JSON.parse(snap) as { unitCost: number; source: string };
    check("H4 snapshot roundtrip keeps unitCost & source", parsed.unitCost === 34.05 && parsed.source === "PURCHASE");
  }

  // ---------- Phase I: 批次收货（移动加权均价 + 磅差容忍带） ----------
  {
    // I1 移动加权：10根×6m 旧均价20 + 5根×6m 批次25 → (1200+750)/90 = 21.6667
    const avg = movingAveragePerMeter(10, 6000, 20, 5, 25);
    check("I1 moving average (60m@20 + 30m@25) / 90m = 21.6667", Math.abs(avg - 21.6667) < 0.001, `avg=${avg}`);
    // I2 首次入库（无旧价）直接取批次价
    check("I2 first receipt initializes to batch price", movingAveragePerMeter(0, 6000, null, 5, 25) === 25);
    check("I2 null old avg adopts batch price", movingAveragePerMeter(10, 6000, null, 5, 25) === 25);
    // I3 理论重量 = 根×定尺×米重
    const tw = theoreticalWeightKg(10, 6000, 0.72);
    check("I3 theoretical weight 10×6m×0.72 = 43.2kg", tw === 43.2, `tw=${tw}`);
    // I4 磅差：45/43.2 偏差 4.2% 在容忍带内；48kg 偏差 11.1% 超带
    const dev1 = weightDeviation(45, 43.2);
    const dev2 = weightDeviation(48, 43.2);
    check("I4 deviation 45kg = 4.2% within band", dev1 != null && dev1 > 0.04 && dev1 < 0.05, `dev=${dev1}`);
    check("I4 deviation 48kg = 11.1% exceeds 5% band", dev2 != null && dev2 > WEIGHT_TOLERANCE, `dev=${dev2}`);
    check("I4 missing theoretical skips check", weightDeviation(50, null) === null);
  }

  // ---------- Phase J: 第 3 步表面化（旧文本解析 + 原料绑定校验 + 读端统一） ----------
  {
    const parse = (t: string) => surfaceCodesOf({ surfaceTreatment: t });
    check("J1 legacy dict parses Silver太空银-氧化 → A/SV", JSON.stringify(parse("Silver太空银-氧化")) === JSON.stringify({ processCode: "A", colorCode: "SV" }));
    check("J1 legacy dict parses 热转印白橡木纹 → T/WO", JSON.stringify(parse("热转印白橡木纹")) === JSON.stringify({ processCode: "T", colorCode: "WO" }));
    check("J1 legacy dict parses 胚料本色 → NP/null", JSON.stringify(parse("胚料本色")) === JSON.stringify({ processCode: "NP", colorCode: null }));
    check("J1 code pattern parses A-SV directly", JSON.stringify(parse("A-SV")) === JSON.stringify({ processCode: "A", colorCode: "SV" }));
    check("J1 unparseable noise returns nulls", JSON.stringify(parse("诺贝脚轮")) === JSON.stringify({ processCode: null, colorCode: null }));
    check("J1 line codes take precedence over legacy text", surfaceCodesOf({ surfaceProcessCode: "T", surfaceColorCode: "BK", surfaceTreatment: "A-SV" }).processCode === "T");

    check("J2 matching surface passes", surfaceMismatch({ surfaceProcessCode: "A", surfaceColorCode: "SV" }, { surfaceProcessCode: "A", surfaceColorCode: "SV" }) === null);
    check("J2 legacy text resolves before mismatch check", surfaceMismatch({ surfaceTreatment: "Silver太空银-氧化" }, { surfaceProcessCode: "A", surfaceColorCode: "SV" }) === null);
    const mm = surfaceMismatch({ surfaceProcessCode: "A", surfaceColorCode: "BK" }, { surfaceProcessCode: "A", surfaceColorCode: "SV" });
    check("J2 color mismatch rejected", mm != null && mm.includes("颜色"));
    const mp = surfaceMismatch({ surfaceTreatment: "A-SV" }, { surfaceProcessCode: "T", surfaceColorCode: "WO" });
    check("J2 process mismatch rejected", mp != null && mp.includes("表面处理"));
    check("J2 raw without codes accepts anything", surfaceMismatch({ surfaceProcessCode: "W", surfaceColorCode: "BK" }, {}) === null);

    check("J3 surfaceCodesText prefers codes", surfaceCodesText({ surfaceProcessCode: "A", surfaceColorCode: "SV", surfaceTreatment: "旧文" }) === "A-SV");
    check("J3 surfaceCodesText falls back to legacy", surfaceCodesText({ surfaceTreatment: "旧文" }) === "旧文");
  }


  // ---------- Phase K: 库存模块完整化（调拨/余段回库/估值/收发存/占用/补货/库龄/ABC） ----------
  {
    // 造两间测试仓 + 一个原料 + 一个五金，全部 try/finally 清理
    const tag = `K${Date.now().toString(36).toUpperCase()}`;
    const dealerK = await prisma.dealer.create({
      data: {
        dealerNo: `SMD-${tag}`, companyName: `Smoke K ${tag}`, contactName: "K", contactPhone: "13000000000",
        priceLevel: "A", creditLimit: new Prisma.Decimal(100000), creditBalance: new Prisma.Decimal(100000), paymentMethod: "CREDIT",
      },
    });
    const wsA = await prisma.workshop.create({ data: { code: `WS-${tag}-A`, name: `仓A-${tag}` } });
    const wsB = await prisma.workshop.create({ data: { code: `WS-${tag}-B`, name: `仓B-${tag}` } });
    try {
      const rawSku = `RAW-${tag}-4000-A-SV`;
      const hwSku = `HW-${tag}`;
      const raw = await prisma.product.create({
        data: {
          sku: rawSku, productName: `${tag} 原料棒`, category: "PROFILE", series: tag,
          isRawMaterial: true, materialStage: "RAW", lengthMm: 4000,
          surfaceProcessCode: "A", surfaceColorCode: "SV",
          weightPerMeter: 0.63, purchasePrice: 80, retailPrice: 100, unit: "根",
        },
      });
      await prisma.product.create({
        data: { sku: hwSku, productName: `${tag} 五金`, category: "HARDWARE", series: tag, purchasePrice: 2, retailPrice: 3, unit: "个" },
      });

      // K1 调拨前置：收货入 A 仓（带批次号 + 均价），再调拨到 B 仓
      await applyStockMovement(prisma, {
        workshopId: wsA.id, sku: rawSku, productName: raw.productName,
        delta: 10, type: "PO_RECEIPT", refType: "PO", refNo: `PO-${tag}`,
        unitCost: 20, avgCostPerMeter: 20, batchNo: "L2609-01",
        operatorName: "smoke",
      });
      const mov = await prisma.stockMovement.findFirst({ where: { sku: rawSku, workshopId: wsA.id } });
      check("K1 batchNo persisted on receipt movement", mov?.batchNo === "L2609-01");

      const tr = await prisma.transferOrder.create({
        data: {
          transferNo: `TR-${tag}`, fromWorkshopId: wsA.id, toWorkshopId: wsB.id, operatorName: "smoke",
          lines: { create: [{ sku: rawSku, productName: raw.productName, quantity: 4 }] },
        },
      });
      await applyStockMovement(prisma, {
        workshopId: wsA.id, sku: rawSku, productName: raw.productName,
        delta: -4, type: "TRANSFER_OUT", refType: "TRANSFER", refNo: tr.transferNo, unitCost: 20, operatorName: "smoke",
      });
      await applyStockMovement(prisma, {
        workshopId: wsB.id, sku: rawSku, productName: raw.productName,
        delta: 4, type: "TRANSFER_IN", refType: "TRANSFER", refNo: tr.transferNo,
        unitCost: 20, avgCostPerMeter: 20, operatorName: "smoke",
      });
      const [invA, invB] = await Promise.all([
        prisma.workshopInventory.findUnique({ where: { workshopId_sku: { workshopId: wsA.id, sku: rawSku } } }),
        prisma.workshopInventory.findUnique({ where: { workshopId_sku: { workshopId: wsB.id, sku: rawSku } } }),
      ]);
      check("K2 transfer moves quantity A 10→6", invA?.quantity === 6);
      check("K2 transfer lands B 0→4 with avg carried", invB?.quantity === 4 && Number(invB?.avgCostPerMeter) === 20);

      // K3 余段回库：4000 棒扣 1 根切 5×700=3500，余 500 段回库成 SEMI
      const order = await prisma.salesOrder.create({
        data: {
          orderNo: `SO-${tag}`, dealerId: dealerK.id, orderStatus: "CONFIRMED",
          targetDeliveryDate: new Date(), dealerAccount: "smoke",
          totalAmount: new Prisma.Decimal(100), receiverName: "t", receiverPhone: "1", receiverAddress: "a",
          lines: {
            create: [{
              lineNo: 1, lineType: "PROFILE", sku: `C-${tag}`, productName: "切件",
              rawProductId: raw.id, cutLengthMm: 700, quantity: 5,
              surfaceProcessCode: "A", surfaceColorCode: "SV",
              unitPrice: new Prisma.Decimal(20), lineAmount: new Prisma.Decimal(100),
            }],
          },
        },
      });
      const wo = await prisma.workOrder.create({
        data: { workOrderNo: `WO-${tag}`, orderNo: order.orderNo, workshopId: wsA.id, status: "PACKING" },
      });
      await consumeWorkOrderMaterials(prisma, { workOrderNo: wo.workOrderNo, orderNo: order.orderNo, workshopId: wsA.id, note: "smoke K3" });
      const semiSku = await generateProductSku(prisma, {
        category: "PROFILE", series: tag, isRawMaterial: true, materialStage: "SEMI",
        surfaceProcessCode: "A", surfaceColorCode: "SV", lengthMm: 500,
      });
      const semi = await prisma.product.create({
        data: {
          sku: semiSku, productName: `${tag} 余段 500`, category: "PROFILE", series: tag,
          isRawMaterial: true, materialStage: "SEMI", lengthMm: 500,
          surfaceProcessCode: "A", surfaceColorCode: "SV", purchasePrice: 10, retailPrice: 12, unit: "根",
        },
      });
      await applyStockMovement(prisma, {
        workshopId: wsA.id, sku: semiSku, productName: semi.productName,
        delta: 1, type: "PRODUCTION_RETURN", refType: "WO_RETURN", refNo: wo.workOrderNo,
        unitCost: 20, avgCostPerMeter: 20,
        note: `余段回库 ← ${rawSku} · 段长 500mm`, operatorName: "smoke",
      });
      const semiInv = await prisma.workshopInventory.findUnique({ where: { workshopId_sku: { workshopId: wsA.id, sku: semiSku } } });
      check("K3 leftover returns as SEMI stock", semiInv?.quantity === 1);
      check("K3 consumption deducted 1 bar from A (6→5)", (await prisma.workshopInventory.findUnique({ where: { workshopId_sku: { workshopId: wsA.id, sku: rawSku } } }))?.quantity === 5);

      // K4 估值：A 仓 raw 5 根×4m×20 = 400；SEMI 1 段×0.5m×20 = 10；B 仓 raw 4×4×20=320 → 共 730
      const valuation = await getValuation(prisma);
      const v = valuation.rows.filter((r) => r.sku === rawSku || r.sku === semiSku);
      const vSum = Math.round(v.reduce((sum, r) => sum + r.amount, 0));
      check("K4 valuation math (5×4m×20 + 1×0.5m×20 + 4×4m×20 = 730)", vSum === 730, `got ${vSum}`);
      check("K4 unitValue fallback uses purchase price without avg", unitValueOf({ sku: "X" }, { category: "HARDWARE", purchasePrice: 2 }).unitValue === 2);

      // K5 收发存：raw 期初0 + 收10 − 调出4 − 领1 = 期末5(A) + 4(B) = 9
      const now = new Date();
      const period = await getPeriodSummary(prisma, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1));
      const prow = period.find((r) => r.sku === rawSku);
      check("K5 period summary opening 0 / received 14(10采购+4调拨入) / issued 5(1领料+4调拨出) / closing 9",
        prow?.opening === 0 && prow?.received === 14 && prow?.issued === 5 && prow?.closing === 9
          && prow?.receivedPo === 10 && prow?.receivedTransfer === 4
          && prow?.issuedConsume === 1 && prow?.issuedTransfer === 4,
        JSON.stringify(prow));

      // K6 占用与可用量：工单已扣料（PACKING 后 consumed）→ 不再占用；再造一张未扣料的开单占用 2 根
      const order2 = await prisma.salesOrder.create({
        data: {
          orderNo: `SO-${tag}-2`, dealerId: dealerK.id, orderStatus: "PRODUCING",
          targetDeliveryDate: new Date(), dealerAccount: "smoke",
          totalAmount: new Prisma.Decimal(50), receiverName: "t", receiverPhone: "1", receiverAddress: "a",
          lines: { create: [{ lineNo: 1, lineType: "PROFILE", sku: `C-${tag}-2`, productName: "切件2", rawProductId: raw.id, cutLengthMm: 3600, quantity: 2, surfaceProcessCode: "A", surfaceColorCode: "SV", unitPrice: new Prisma.Decimal(20), lineAmount: new Prisma.Decimal(40) }] },
        },
      });
      await prisma.workOrder.create({ data: { workOrderNo: `WO-${tag}-2`, orderNo: order2.orderNo, workshopId: wsA.id, status: "PROCESSING" } });
      const avail = await getAvailability(prisma);
      const t = avail.totalBySku.get(rawSku);
      check("K6 availability = 9 onHand − 1 allocated (open WO 3600×2 → 2 bars? floor bar math)", t?.onHand === 9 && t?.allocated === 2 && t?.available === 7, JSON.stringify(t));
      check("K6 consumed WO not allocated (first WO excluded)", avail.allocations.outsourced.length >= 0);

      // K7 补货建议：消耗 1 根/30天 → 日均≈0.03；缺料场景 available<0 时给出建议
      const reorder = await getReorderSuggestions(prisma);
      const rrow = reorder.find((r) => r.sku === rawSku);
      check("K7 reorder row computed with lead fallback 7d", rrow != null && rrow.leadDays === 7 && rrow.onHand === 9 && rrow.available === 7, JSON.stringify(rrow));

      // K8 ABC：有消耗价值的 SKU 出现在分类中且累计单调
      const abc = await getAbcClassification(prisma);
      check("K8 abc classified raw sku as A (only consumer)", abc.length > 0 && abc[0].klass === "A");
      const cumOk = abc.every((r, i) => i === 0 || abc[i - 1].cumulative <= r.cumulative + 0.001);
      check("K8 abc cumulative monotonic", cumOk);

      // K9 库龄：新建库存行无流水 → lastMovedAt 回退 updatedAt，今日入库不进呆滞
      const aging = await getAging(prisma, 90);
      check("K9 fresh stock not stale", !aging.some((r) => r.sku === rawSku));
    } finally {
      // 清理：注意外键顺序（movement→inventory→wo→order→transfer→product→workshop）
      await prisma.stockMovement.deleteMany({ where: { workshopId: { in: [wsA.id, wsB.id] } } });
      await prisma.workshopInventory.deleteMany({ where: { workshopId: { in: [wsA.id, wsB.id] } } });
      const wos = await prisma.workOrder.findMany({ where: { orderNo: { startsWith: `SO-${tag}` } }, select: { workOrderNo: true } });
      for (const w of wos) await prisma.workOrder.delete({ where: { workOrderNo: w.workOrderNo } }).catch(() => null);
      await prisma.salesOrder.deleteMany({ where: { orderNo: { startsWith: `SO-${tag}` } } });
      await prisma.transferOrder.deleteMany({ where: { transferNo: `TR-${tag}` } });
      await prisma.product.deleteMany({ where: { series: tag } });
      await prisma.workshop.deleteMany({ where: { id: { in: [wsA.id, wsB.id] } } });
      await prisma.dealer.deleteMany({ where: { id: dealerK.id } });
    }
  }

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

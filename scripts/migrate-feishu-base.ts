/**
 * W1c: 飞书 Base「管材加工单」774 条真实数据 → parti-b2b 迁移脚本
 *
 * 数据源：~/Desktop/jiedan/data/base-export-p1..4.md（lark-cli +record-list 导出的 markdown 表格）
 * 口径（PRD v0.2 §6 + D1-D9）：
 *  - 父记录 → SalesOrder 头；子记录 → SalesOrderLine；加工编号 → displayOrderNo + legacyBaseNo
 *  - 寸 × 25.4mm（D8 英寸口径）；原文必存 legacyRawSize
 *  - 颜色拆 surfaceProcessCode/surfaceColorCode（附录B 映射），原文存 surfaceTreatment
 *  - 铣销子孔→D、预埋连接件→EM，型材行加 L（截断）
 *  - 发货时间 → Shipment.shippedAt（口径=发货时刻）；承运商/运单号从备注嗅探
 *  - 收货地址 → WALK_IN Dealer + DealerAddress；无地址按接收仓库映射桶客户
 *  - Base 无价格：unitPrice/totalAmount = 0（对账按数量口径）
 *  - 未发货且交期超 30 天 → needsReview（悬单）
 * 幂等：已存在 legacyBaseNo 的订单跳过，可重复运行。
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();
const DATA_DIR = process.env.MIGRATE_DATA_DIR ?? join(process.env.HOME!, "Desktop/jiedan/data");

// ---------- 解析 ----------
const COLS = ["_rid","编号","颜色","交付年份","收货地址","电话","数量","收货人","铣销子孔","预埋连接件","目标交期","接收仓库","下单人","备注","部件名称","交付时间","父记录","接单人","截断尺寸","部件型号"];

type Row = Record<string, string> & { _rid: string };

function parseRows(): Row[] {
  const rows: Row[] = [];
  for (let i = 1; i <= 4; i++) {
    const file = join(DATA_DIR, `base-export-p${i}.md`);
    const text = readFileSync(file, "utf-8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("|")) continue;
      const cells = t.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.length !== 20) continue;
      if (cells[0] === "_record_id" || /^[-\s]+$/.test(cells[0])) continue;
      rows.push(Object.fromEntries(COLS.map((c, idx) => [c, cells[idx]])) as Row);
    }
  }
  return rows;
}

function arr(v: string): string[] { return v ? [...v.matchAll(/"([^"]*)"/g)].map((m) => m[1]).filter(Boolean) : []; }
function sel(v: string): string | null { const a = arr(v); return a[0] ?? null; }
function userName(v: string): string | null { const m = [...v.matchAll(/"name":"([^"]+)"/g)].map((x) => x[1]); return m[0] ?? null; }
function dt(v: string): Date | null { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; }

// ---------- 映射表 ----------
const RAW_FAMILY: [RegExp, string][] = [
  [/2525/i, "RAW-P2525"], [/2550/i, "RAW-P2550"], [/5050/i, "RAW-P5050"], [/7575/i, "RAW-P7575"],
];
// 附录 B：Base 颜色 → [工艺码, 颜色码]
const COLOR_MAP: Record<string, [string | null, string | null]> = {
  "Grey太空灰色-氧化": ["A", "GY"], "Silver太空银-氧化": ["A", "SV"], "Black曜石黑-氧化": ["A", "OB"],
  "Darkblue午夜蓝-氧化": ["A", "NB"], "Darkgrey深灰-氧化": ["A", "GY"], "Gold玫瑰金-氧化": ["A", "RG"],
  "Gold 古铜金-氧化": ["A", "AG"], "Orange活力橙-氧化": ["A", "OR"], "定制黄金色-氧化": ["A", "MG"],
  "Pink粉色-水漆": ["W", null], "Blue 冰川蓝-水漆": ["W", "IB"], "White 珍珠白-水漆": ["W", "PW"],
  "Green翡翠绿-水漆": ["W", "JG"], "热转印白橡木纹": ["T", "WO"], "胚料本色": ["NP", null],
  "磁力抛光": ["MP", null], "镀铬亮银": ["CR", "SV"], "诺贝脚轮": [null, null],
};
const WAREHOUSE_BUCKET: Record<string, string> = {
  "总仓": "总仓（历史）", "江虹仓": "总部仓（江虹）", "伦教备仓": "车间仓（伦教）",
  "金华仓": "金华仓（已弃用）", "喷油厂": "喷油厂（外协）", "直发客户": "直发客户（历史未记地址）",
};

// ---------- 统计 ----------
const report = {
  rowsParsed: 0, blankSkipped: 0, ordersImported: 0, linesImported: 0, ordersSkippedExisting: 0,
  shipmentsCreated: 0, needsReview: 0, cancelled: 0,
  qtyByPart: {} as Record<string, number>, qtyTotal: 0,
  flagged: [] as string[],
};
const flag = (s: string) => { if (report.flagged.length < 200) report.flagged.push(s); };

// ---------- 主流程 ----------
async function main() {
  const rows = parseRows();
  report.rowsParsed = rows.length;

  // 剔除空记录（无部件名称且无数量）
  const usable = rows.filter((r) => (r["部件名称"] || r["数量"]));
  report.blankSkipped = rows.length - usable.length;

  const byId = new Map(usable.map((r) => [r._rid, r]));
  const rootOf = (r: Row): Row => {
    const m = r["父记录"].match(/(rec\w+)/);
    if (!m) return r;
    const parent = byId.get(m[1]);
    if (!parent) return r; // 悬空引用 → 自成单
    return rootOf(parent);
  };

  // 分组：root record id → 该单全部行（root 自身也是一个行项目，除非它无部件名称）
  const groups = new Map<string, Row[]>();
  for (const r of usable) {
    const root = rootOf(r);
    if (!groups.has(root._rid)) groups.set(root._rid, []);
    groups.get(root._rid)!.push(r);
  }

  // 产品缓存
  const products = await prisma.product.findMany();
  const rawBySku = new Map(products.filter((p) => p.isRawMaterial).map((p) => [p.sku, p]));
  const hwBySku = new Map(products.filter((p) => p.category === "HARDWARE").map((p) => [p.sku, p]));
  const fallbackRaw = rawBySku.get("RAW-P2525") ?? [...rawBySku.values()][0];

  // 客户缓存（地址客户 + 仓库桶）
  const dealerCache = new Map<string, string>();
  let wiSeq = (await prisma.dealer.count({ where: { customerType: "WALK_IN" } })) + 1;
  async function ensureWalkIn(key: string, name: string, nickname: string | null, phone: string | null, address: string | null): Promise<string> {
    const cached = dealerCache.get(key);
    if (cached) return cached;
    let d = await prisma.dealer.findFirst({ where: { customerType: "WALK_IN", companyName: name } });
    if (!d) {
      d = await prisma.dealer.create({
        data: {
          dealerNo: `WI-${String(wiSeq++).padStart(4, "0")}`,
          companyName: name, contactName: nickname ?? name.slice(0, 20), contactPhone: phone ?? "-",
          customerType: "WALK_IN", nickname, priceLevel: "C", creditLimit: 0, creditBalance: 0,
          paymentMethod: "PREPAID", status: "ACTIVE", source: "飞书Base迁移",
          remark: address ? null : "仓库桶客户（历史无收货地址）",
        },
      });
      if (address && nickname && phone) {
        await prisma.dealerAddress.create({
          data: { dealerId: d.id, addressType: "shipping", receiverName: nickname, receiverPhone: phone,
            province: "", city: "", district: "", detailAddress: address, isDefault: true },
        });
      }
    }
    dealerCache.set(key, d.id);
    return d.id;
  }

  let soSeq = 0;
  for (const [rootId, group] of groups) {
    const root = byId.get(rootId)!;
    const head = root; // 根记录即订单头
    const baseNo = head["编号"];
    if (!baseNo) { flag(`组 ${rootId} 无加工编号，跳过`); continue; }
    const exists = await prisma.salesOrder.findUnique({ where: { legacyBaseNo: baseNo } });
    if (exists) { report.ordersSkippedExisting++; continue; }

    const receiverNameRaw = head["收货人"] || "";
    const phoneRaw = head["电话"] || "";
    const addrRaw = head["收货地址"] || "";
    const warehouse = sel(head["接收仓库"]) ?? "";
    const remark = head["备注"] || "";
    const orderer = userName(head["下单人"]) ?? "未知";
    const receiver = userName(head["接单人"]) ?? "";

    // 客户：有地址→地址客户；无地址→仓库桶
    let dealerId: string; let receiverName: string; let receiverPhone: string; let receiverAddress: string;
    if (addrRaw) {
      const key = `${receiverNameRaw}|${phoneRaw}|${addrRaw}`;
      dealerId = await ensureWalkIn(key, addrRaw.length > 24 ? addrRaw.slice(0, 24) + "…" : addrRaw, receiverNameRaw || null, phoneRaw || null, addrRaw);
      receiverName = receiverNameRaw || addrRaw.slice(0, 12);
      receiverPhone = phoneRaw || "-";
      receiverAddress = addrRaw;
    } else {
      const bucket = WAREHOUSE_BUCKET[warehouse] ?? "直发客户（历史未记地址）";
      dealerId = await ensureWalkIn(`bucket|${bucket}`, bucket, null, null, null);
      receiverName = bucket; receiverPhone = "-"; receiverAddress = bucket;
    }

    // 订单时间与交期
    const ymd = baseNo.slice(0, 8);
    const orderDate = dt(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T08:00:00+08:00`) ?? new Date();
    const target = dt(head["目标交期"]) ?? new Date(orderDate.getTime() + 3 * 86400_000);
    const shipAtRaw = group.map((g) => dt(g["交付时间"])).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime());
    const shipAt = shipAtRaw[0] ?? null;
    const isCancelled = remark.includes("取消");
    const overdue30 = !shipAt && target.getTime() < Date.now() - 30 * 86400_000;

    // 行项目
    const lineRows = group.filter((g) => g["部件名称"] || g["数量"]);
    const lineData = lineRows.map((g, idx) => {
      const partName = sel(g["部件名称"]) ?? "未知部件";
      const model = sel(g["部件型号"]);
      const qty = parseInt(g["数量"] || "0", 10) || 0;
      const colorRaw = sel(g["颜色"]);
      const [sProc, sColor] = colorRaw ? (COLOR_MAP[colorRaw] ?? [null, null]) : [null, null];
      if (colorRaw && !COLOR_MAP[colorRaw]) flag(`${baseNo} 未知颜色: ${colorRaw}`);
      const sizeRaw = sel(g["截断尺寸"]);
      let cutMm: number | null = null;
      if (sizeRaw) {
        const mm = sizeRaw.match(/^(\d+(?:\.\d+)?)\s*mm$/i);
        const cun = sizeRaw.match(/^(\d+(?:\.\d+)?)\s*寸$/);
        if (mm) cutMm = Math.round(parseFloat(mm[1]));
        else if (cun) cutMm = Math.round(parseFloat(cun[1]) * 25.4); // D8: 英寸口径
        else flag(`${baseNo} 尺寸无法解析: ${sizeRaw}`);
      }
      const processes: string[] = [];
      if (g["铣销子孔"] === "true") processes.push("D");
      if (g["预埋连接件"] === "true") processes.push("EM");

      const lineRemark = g["备注"] || "";
      const lineCancelled = lineRemark.includes("取消");
      if (partName === "铝管") {
        const fam = RAW_FAMILY.find(([re]) => model && re.test(model));
        const raw = fam ? rawBySku.get(fam[1]) : undefined;
        if (model && !fam) flag(`${baseNo} 型号未匹配原料族: ${model}（回退 RAW-P2525）`);
        return {
          lineNo: idx + 1, lineType: "PROFILE" as const,
          sku: raw?.sku ?? fallbackRaw.sku, productName: `${model ?? "铝管"} 铝管`,
          rawProductId: raw?.id ?? fallbackRaw.id, cutLengthMm: cutMm,
          processCodes: ["L", ...processes],
          surfaceProcessCode: sProc, surfaceColorCode: sColor,
          surfaceTreatment: colorRaw, legacyRawSize: sizeRaw,
          quantity: qty, unitPrice: 0 as any, lineAmount: 0 as any, isCustom: true,
          _cancelled: lineCancelled, _remark: lineRemark,
        };
      }
      // 五金/配件
      const hw = model ? hwBySku.get(model) : undefined;
      if (model && !hw) flag(`${baseNo} 五金型号未匹配产品: ${partName}/${model}（无 productId 保留）`);
      return {
        lineNo: idx + 1, lineType: "HARDWARE" as const,
        sku: model ?? partName, productName: `${partName}${model ? " " + model : ""}`,
        productId: hw?.id ?? null, cutLengthMm: cutMm,
        processCodes: processes, surfaceProcessCode: sProc, surfaceColorCode: sColor,
        surfaceTreatment: colorRaw, legacyRawSize: sizeRaw,
        quantity: qty, unitPrice: 0 as any, lineAmount: 0 as any, isCustom: false,
        _cancelled: lineCancelled, _remark: lineRemark,
      };
    });

    // 汇总数量
    for (const l of lineData) {
      report.qtyByPart[l.productName] = (report.qtyByPart[l.productName] ?? 0) + l.quantity;
      report.qtyTotal += l.quantity;
    }

    const childRemarks = lineData.filter((l: any) => l._remark).map((l: any) => `${l.sku}: ${l._remark}`);
    const cancelledLines = lineData.filter((l: any) => l._cancelled).map((l: any) => `${l.sku}×${l.quantity}已取消`);
    const fullRemark = [
      remark, `【Base迁移】下单:${orderer} 接单:${receiver || "-"} 仓库:${warehouse || "-"}`,
      ...childRemarks, ...((cancelledLines.length ? [`取消行: ${cancelledLines.join("，")}`] : [])),
    ].filter(Boolean).join("；");

    const order = await prisma.salesOrder.create({
      data: {
        orderNo: `SO-MIG-${String(++soSeq).padStart(4, "0")}-${baseNo.slice(-4)}`,
        displayOrderNo: baseNo, legacyBaseNo: baseNo,
        dealerId, orderDate, targetDeliveryDate: target,
        dealerAccount: `${orderer}(Base)`,
        receiverName, receiverPhone, receiverAddress: receiverAddress,
        remark: fullRemark,
        totalAmount: 0, orderStatus: isCancelled ? "CANCELLED" : shipAt ? "SHIPPED" : "PRODUCING",
        paymentStatus: "UNPAID", createdVia: "INTERNAL",
        needsReview: overdue30 && !isCancelled,
        actualDeliveryDate: shipAt,
        lines: { create: lineData.map((l: any) => {
          const { _cancelled, _remark, ...clean } = l;
          return clean;
        }) },
      },
      include: { lines: true },
    });
    report.ordersImported++;
    report.linesImported += order.lines.length;
    if (isCancelled) report.cancelled++;
    if (overdue30 && !isCancelled) report.needsReview++;

    // 工单 + 事件 + 发货单
    const workshop = await prisma.workshop.findFirst({ where: { isActive: true } });
    if (workshop) {
      const wo = await prisma.workOrder.create({
        data: {
          workOrderNo: `WO-MIG-${baseNo.slice(-6)}`, orderNo: order.orderNo, workshopId: workshop.id,
          status: shipAt ? "SHIPPED" : "PENDING_START",
          committedDeliveryDate: target, qcRequired: false,
          actualShippedAt: shipAt, assignedBy: "Base迁移",
          events: {
            create: [
              { fromStatus: null, toStatus: "PENDING_START", note: "飞书Base迁移", operatorName: orderer, createdAt: orderDate },
              ...(shipAt ? [{ fromStatus: "PENDING_START" as any, toStatus: "SHIPPED" as any, note: "迁移：Base发货时间", operatorName: receiver || "Base", createdAt: shipAt }] : []),
            ],
          },
        },
      });
      if (shipAt) {
        // 发货单（口径：发货时刻）
        const sfTrack = remark.match(/SF\d{10,14}/);
        const carrier = /顺丰/.test(remark) ? "顺丰速运" : /德邦/.test(remark) ? "德邦物流" : "（未记录）";
        await prisma.shipment.create({
          data: {
            shipmentNo: `SH-MIG-${baseNo.slice(-6)}`,
            carrier, trackingNo: sfTrack ? sfTrack[0] : null,
            shippedAt: shipAt,
            freightPayType: /到付/.test(remark) ? "COD" : "PREPAID",
            fromType: /氧化厂/.test(remark) ? "OUTSOURCER" : "FACTORY",
            fromNote: /氧化厂/.test(remark) ? "从氧化厂直发（备注）" : null,
            note: remark || null, createdByName: "Base迁移",
            lines: { create: order.lines
              .filter((_, i) => !lineData[i]._cancelled)
              .map((l) => ({ orderNo: order.orderNo, lineId: l.id, quantity: l.quantity })) as any },
          },
        });
        report.shipmentsCreated++;
      }
      void wo;
    } else {
      flag(`${baseNo} 无活跃车间，未建工单`);
    }
  }

  // ---------- 对账报告 ----------
  const dbOrders = await prisma.salesOrder.count({ where: { legacyBaseNo: { not: null } } });
  const dbLines = await prisma.salesOrderLine.count({ where: { order: { legacyBaseNo: { not: null } } } });
  console.log("\n========== 迁移对账报告 ==========");
  console.log(`解析记录: ${report.rowsParsed}（剔除空记录 ${report.blankSkipped}，可用 ${report.rowsParsed - report.blankSkipped}）`);
  console.log(`Base 订单组: ${groups.size} → 导入 ${report.ordersImported}（已存在跳过 ${report.ordersSkippedExisting}）；库中迁移订单合计 ${dbOrders}`);
  console.log(`行项目: 导入 ${report.linesImported}；库中迁移行合计 ${dbLines}`);
  console.log(`数量总计: ${report.qtyTotal}`);
  console.log(`发货单: ${report.shipmentsCreated}；取消: ${report.cancelled}；悬单(needsReview): ${report.needsReview}`);
  console.log("数量分布:");
  for (const [k, v] of Object.entries(report.qtyByPart).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  if (report.flagged.length) {
    console.log(`\n⚠ 需人工核对 ${report.flagged.length} 条:`);
    for (const f of report.flagged) console.log(`  - ${f}`);
  }
  console.log("==================================\n");
  // 落盘报告
  const reportFile = join(DATA_DIR, "migration-report.txt");
  const fs = await import("node:fs");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");
  console.log(`报告已写入 ${reportFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

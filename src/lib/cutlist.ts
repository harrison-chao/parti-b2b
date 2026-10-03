import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";

export type CutRow = {
  key: string;
  category: "PROFILE" | "HARDWARE";
  surface: string;        // "阳极氧化·太空银" / "—"
  surfaceProcessCode: string | null;
  surfaceColorCode: string | null;
  lengthMm: number | null; // 型材切长；五金为空
  lengthInch: string;      // 寸（≈mm/25.4）；五金为空
  processes: string[];     // 汇总工序码（型材）
  sku: string;
  productName: string;
  quantity: number;
  orderCount: number;
};

/** W2a: 截料清单聚合——在产工单（未打包完成前）的全部行按（表面处理, 长度）归并。
 *  这是车间排产的心智模型（Base 774 条数据的组织方式）。 */
export async function buildCutList(workshopId?: string) {
  const wos = await prisma.workOrder.findMany({
    where: {
      status: { in: ["PENDING_START", "PROCESSING", "OUTSOURCING", "QC"] },
      ...(workshopId ? { workshopId } : {}),
    },
    include: {
      order: { select: { lines: { where: { lineType: { not: "OUTSOURCED" } } } } },
    },
  });

  const settings = await loadSettings();
  const procLabel = new Map(settings.surfaceProcesses.map((o) => [o.code, o.label]));
  const colorLabel = new Map(settings.surfaceColors.map((o) => [o.code, o.label]));

  const rows = new Map<string, CutRow>();
  for (const wo of wos) {
    for (const l of wo.order.lines) {
      const surface = [l.surfaceProcessCode ? (procLabel.get(l.surfaceProcessCode) ?? l.surfaceProcessCode) : null,
                       l.surfaceColorCode ? (colorLabel.get(l.surfaceColorCode) ?? l.surfaceColorCode) : null]
        .filter(Boolean).join("·") || "—";
      const isProfile = l.lineType === "PROFILE";
      const key = `${isProfile ? "P" : "H"}|${l.surfaceProcessCode ?? ""}|${l.surfaceColorCode ?? ""}|${l.cutLengthMm ?? ""}|${l.sku}`;
      const hit = rows.get(key);
      if (hit) {
        hit.quantity += l.quantity;
        hit.orderCount += 1;
        for (const c of l.processCodes) if (!hit.processes.includes(c)) hit.processes.push(c);
      } else {
        rows.set(key, {
          key, category: isProfile ? "PROFILE" : "HARDWARE",
          surface, surfaceProcessCode: l.surfaceProcessCode, surfaceColorCode: l.surfaceColorCode,
          lengthMm: l.cutLengthMm,
          lengthInch: l.cutLengthMm ? (l.cutLengthMm / 25.4).toFixed(1) : "",
          processes: [...l.processCodes], sku: l.sku, productName: l.productName,
          quantity: l.quantity, orderCount: 1,
        });
      }
    }
  }

  const list = [...rows.values()].sort((a, b) =>
    a.surface === b.surface
      ? (b.lengthMm ?? 0) - (a.lengthMm ?? 0) || b.quantity - a.quantity
      : a.surface.localeCompare(b.surface, "zh"));
  return { rows: list, orderCount: wos.length, generatedAt: new Date() };
}

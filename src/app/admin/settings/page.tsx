import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";
import { SettingsForm } from "./form";

export type RawSeriesItem = {
  sku: string;
  barMm: number | null;
  code: string;
  weight: string | null;
  stage: string | null;
  active: boolean;
};
export type RawSeriesSummary = { series: string; items: RawSeriesItem[] };

export default async function SettingsPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/admin");
  const s = await loadSettings();
  // 型材系列总览：下单下拉的选项来源是产品目录的原料档案（隐式主数据），在此只读展示
  const raws = await prisma.product.findMany({
    where: { category: "PROFILE", isRawMaterial: true },
    select: {
      sku: true, series: true, lengthMm: true,
      surfaceProcessCode: true, surfaceColorCode: true,
      weightPerMeter: true, materialStage: true, isActive: true,
    },
    orderBy: [{ series: "asc" }, { sku: "asc" }],
  });
  const map = new Map<string, RawSeriesItem[]>();
  for (const r of raws) {
    const key = (r.series ?? "").trim() || "（未填系列）";
    const items = map.get(key) ?? [];
    items.push({
      sku: r.sku,
      barMm: r.lengthMm ? Number(r.lengthMm) : null,
      code: [r.surfaceProcessCode, r.surfaceColorCode].filter(Boolean).join("-") || "—",
      weight: r.weightPerMeter != null ? `${Number(r.weightPerMeter)} kg/m` : null,
      stage: r.materialStage ?? "RAW",
      active: r.isActive,
    });
    map.set(key, items);
  }
  const rawSeries: RawSeriesSummary[] = [...map.entries()].map(([series, items]) => ({ series, items }));
  return <SettingsForm initial={s} rawSeries={rawSeries} />;
}

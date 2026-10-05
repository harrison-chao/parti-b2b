import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcPricing } from "@/lib/pricing";
import { resolveRawBasis } from "@/lib/pricing-source";
import { loadSettings, pricingFieldsToConfig } from "@/lib/settings";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const url = req.nextUrl;
  const lengthMm = parseFloat(url.searchParams.get("lengthMm") ?? "0");
  if (!lengthMm || lengthMm <= 0) return fail("lengthMm 必填且大于 0");

  const role = session.user.role;
  const settings = await loadSettings();

  let level: "A" | "B" | "C" | "D" | "E" = "C";
  if (role === "DEALER" && session.user.dealerId) {
    const d = await prisma.dealer.findUnique({
      where: { id: session.user.dealerId },
      select: { priceLevel: true },
    });
    if (d) level = d.priceLevel;
  } else {
    const qLevel = url.searchParams.get("level");
    if (qLevel && ["A", "B", "C"].includes(qLevel)) {
      level = qLevel as typeof level;
    }
  }

  // 指定原料型材时按 SKU 级口径计价（米重/良率/每米价三级回退），未指定走全局常数
  let basis;
  const rawProductId = url.searchParams.get("rawProductId");
  if (rawProductId) {
    const raw = await prisma.product.findUnique({
      where: { id: rawProductId },
      select: { sku: true, weightPerMeter: true, yieldRate: true, purchasePrice: true, lengthMm: true, isRawMaterial: true },
    });
    if (raw && raw.isRawMaterial) basis = await resolveRawBasis(raw);
  }

  const full = calcPricing(lengthMm, level, pricingFieldsToConfig(settings.pricingFields), settings.discountRates, basis);
  const discountPercent = Math.round(settings.discountRates[level] * 100);

  if (role === "DEALER") {
    return ok({
      lengthMm: full.lengthMm,
      actualWeight: full.actualWeight,
      priceLevel: level,
      discountPercent,
      dealerPrice: full.dealerPrice,
      retailPrice: full.retailPrice,
    });
  }
  // 完整成本结构（材料成本/加工费/毛利参数）仅管理员；车间只得到价格结果
  if (role !== "ADMIN") {
    return ok({
      lengthMm: full.lengthMm,
      actualWeight: full.actualWeight,
      priceLevel: level,
      discountPercent,
      dealerPrice: full.dealerPrice,
      retailPrice: full.retailPrice,
    });
  }
  return ok({ ...full, priceLevel: level, discountPercent });
}

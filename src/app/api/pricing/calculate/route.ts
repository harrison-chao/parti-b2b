import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcPricing } from "@/lib/pricing";
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

  const full = calcPricing(lengthMm, level, pricingFieldsToConfig(settings.pricingFields), settings.discountRates);
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
  return ok({ ...full, priceLevel: level, discountPercent });
}

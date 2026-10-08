import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadSettings } from "@/lib/settings";
import { ok } from "@/lib/api";

// 报价计算器「客户编码」校验(免登录,middleware 已加白 /api/public):
// 编码 = 客户编号 dealerNo,折扣 = 该客户等级折扣(权限即其自身等级,不可能越权)。
// 只返回有效性与折扣率,不返回客户名称等档案信息。
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!code) return ok({ valid: false, discount: 1, discountPercent: 100, level: null });

  const settings = await loadSettings();
  const dealer = await prisma.dealer.findFirst({
    where: { dealerNo: code, status: "ACTIVE" },
    select: { priceLevel: true },
  });
  if (!dealer) return ok({ valid: false, discount: 1, discountPercent: 100, level: null });

  const rates = settings.discountRates as Record<string, number>;
  const discount = rates[dealer.priceLevel] ?? 1;
  return ok({
    valid: true,
    discount,
    discountPercent: Math.round(discount * 100),
    level: dealer.priceLevel,
  });
}

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calcPricing } from "@/lib/pricing";
import { ok, fail } from "@/lib/api";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const url = req.nextUrl;
  const lengthMm = parseFloat(url.searchParams.get("lengthMm") ?? "0");
  if (!lengthMm || lengthMm <= 0) return fail("lengthMm 必填且大于 0");

  let level: "A" | "B" | "C" | "D" | "E" = "E";
  const dealerId = session.user.dealerId;
  if (dealerId) {
    const d = await prisma.dealer.findUnique({ where: { id: dealerId }, select: { priceLevel: true } });
    if (d) level = d.priceLevel;
  }
  return ok({ ...calcPricing(lengthMm, level), priceLevel: level });
}

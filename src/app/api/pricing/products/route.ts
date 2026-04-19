import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { LEVEL_DISCOUNT } from "@/lib/pricing";

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ series: "asc" }, { lengthInch: "asc" }],
  });
  let level: "A" | "B" | "C" | "D" | "E" = "E";
  if (session.user.dealerId) {
    const d = await prisma.dealer.findUnique({ where: { id: session.user.dealerId }, select: { priceLevel: true } });
    if (d) level = d.priceLevel;
  }
  const discount = LEVEL_DISCOUNT[level];
  return ok({
    priceLevel: level,
    discount,
    products: products.map((p) => ({
      ...p,
      retailPrice: Number(p.retailPrice),
      lengthInch: p.lengthInch ? Number(p.lengthInch) : null,
      lengthMm: p.lengthMm ? Number(p.lengthMm) : null,
      dealerPrice: Math.round(Number(p.retailPrice) * discount * 100) / 100,
    })),
  });
}

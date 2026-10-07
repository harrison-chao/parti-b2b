import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";

export async function GET(_req: NextRequest, { params }: { params: { orderNo: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const role = session.user.role;

  const order = await prisma.salesOrder.findUnique({
    where: { orderNo: params.orderNo },
    include: { lines: { orderBy: { lineNo: "asc" } }, dealer: true },
  });
  if (!order) return fail("订单不存在", 404, 404);

  if (role === "DEALER") {
    if (order.dealerId !== session.user.dealerId) return fail("无权访问", 403, 403);
    // 出站白名单：剥除成本快照/内部备注/价格备注/完整客户档案（列级防泄露）
    const { internalRemark, priceNote, dealer, lines, ...rest } = order;
    return ok({
      ...rest,
      dealer: dealer ? { id: dealer.id, dealerNo: dealer.dealerNo, companyName: dealer.companyName, nickname: dealer.nickname } : null,
      lines: lines.map(({ costSnapshot, ...l }) => l),
    });
  }

  if (role === "WORKSHOP") {
    // 车间只需要生产信息：裁剪 dealer 主体（信用额度/银行账号/税号等 PII）
    const { dealer, ...rest } = order;
    return ok({
      ...rest,
      dealer: dealer
        ? {
            id: dealer.id,
            dealerNo: dealer.dealerNo,
            companyName: dealer.companyName,
            customerType: dealer.customerType,
            nickname: dealer.nickname,
            contactName: dealer.contactName,
            contactPhone: dealer.contactPhone,
          }
        : null,
    });
  }

  return ok(order);
}

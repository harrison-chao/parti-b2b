import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import {
  CRM_CUSTOMER_STAGE_LABEL,
  CRM_CUSTOMER_TYPE_LABEL,
  CRM_INTENT_LEVEL_LABEL,
  formatDateTime,
  formatMoney,
} from "@/lib/utils";

function dealerIdFromSession(session: any) {
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return null;
  return session.user.dealerId;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const dealerId = dealerIdFromSession(session);
  if (!dealerId) return fail("仅经销商可导出 CRM 客户", 403, 403);

  const stage = req.nextUrl.searchParams.get("stage");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const where: any = { dealerId };
  if (stage && stage !== "ALL") where.stage = stage;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { demand: { contains: q, mode: "insensitive" } },
      { source: { contains: q, mode: "insensitive" } },
    ];
  }

  const customers = await prisma.crmCustomer.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      _count: { select: { contactLogs: true, opportunities: true, tasks: true, salesOrders: true } },
    },
  });

  const csv = toCsv(
    [
      "客户类型",
      "客户名称",
      "电话",
      "微信",
      "邮箱",
      "地区",
      "地址",
      "来源",
      "标签",
      "阶段",
      "意向等级",
      "预算",
      "需求描述",
      "备注",
      "下次跟进时间",
      "最近联系时间",
      "跟进数",
      "商机数",
      "任务数",
      "订单数",
      "创建时间",
      "更新时间",
    ],
    customers.map((customer) => [
      CRM_CUSTOMER_TYPE_LABEL[customer.customerType],
      customer.name,
      customer.phone,
      customer.wechat,
      customer.email,
      customer.region,
      customer.address,
      customer.source,
      customer.tags.join(" "),
      CRM_CUSTOMER_STAGE_LABEL[customer.stage],
      customer.intentLevel ? CRM_INTENT_LEVEL_LABEL[customer.intentLevel] : "",
      customer.budget == null ? "" : formatMoney(Number(customer.budget)),
      customer.demand,
      customer.remark,
      formatDateTime(customer.nextFollowAt),
      formatDateTime(customer.lastContactAt),
      customer._count.contactLogs,
      customer._count.opportunities,
      customer._count.tasks,
      customer._count.salesOrders,
      formatDateTime(customer.createdAt),
      formatDateTime(customer.updatedAt),
    ])
  );

  const filename = `crm-customers-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, STOCK_COUNT_STATUS_LABEL } from "@/lib/utils";
import { StockCountEditor } from "./editor";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-secondary text-foreground/80",
  SUBMITTED: "bg-sky-500/15 text-sky-300 ring-1 ring-inset ring-sky-400/20",
  APPROVED: "bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  CANCELLED: "bg-rose-500/15 text-rose-300 ring-1 ring-inset ring-rose-400/20",
};

export default async function StockCountDetailPage({ params }: { params: { countNo: string } }) {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  const sc = await prisma.stockCount.findUnique({
    where: { countNo: params.countNo },
    include: { lines: { orderBy: { sku: "asc" } } },
  });
  if (!sc) notFound();
  if (sc.workshopId !== session.user.workshopId) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">{sc.countNo}</h1>
          <p className="text-sm text-muted-foreground">创建 {formatDateTime(sc.createdAt)}{sc.approvedAt ? ` · 审核 ${formatDateTime(sc.approvedAt)} · ${sc.approvedBy ?? ""}` : ""}</p>
        </div>
        <Badge className={STATUS_COLOR[sc.status] + " text-base px-3 py-1"}>{STOCK_COUNT_STATUS_LABEL[sc.status]}</Badge>
      </div>

      {sc.remark && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">备注：{sc.remark}</CardContent></Card>
      )}

      <StockCountEditor
        countNo={sc.countNo}
        status={sc.status}
        lines={sc.lines.map((l) => ({ id: l.id, sku: l.sku, productName: l.productName, systemQty: l.systemQty, actualQty: l.actualQty, diff: l.diff }))}
      />
    </div>
  );
}

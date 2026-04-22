import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney, formatDate, formatDateTime, PURCHASE_ORDER_STATUS_LABEL, PURCHASE_ORDER_STATUS_COLOR, STOCK_MOVEMENT_TYPE_LABEL } from "@/lib/utils";
import { PODetailActions } from "./actions";

export default async function PODetailPage({ params }: { params: { poNo: string } }) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { poNo: params.poNo },
    include: {
      supplier: true,
      workshop: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });
  if (!po) notFound();

  const movements = await prisma.stockMovement.findMany({
    where: { refType: "PO", refNo: po.poNo },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-mono">{po.poNo}</h1>
          <p className="text-sm text-muted-foreground">创建于 {formatDateTime(po.createdAt)} · {po.createdBy ?? "-"}</p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`/print/po/${po.poNo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center h-9 px-4 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800"
          >
            导出 PDF
          </a>
          <Badge className={PURCHASE_ORDER_STATUS_COLOR[po.status] + " text-base px-3 py-1"}>{PURCHASE_ORDER_STATUS_LABEL[po.status]}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>采购信息</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="供应商" v={`${po.supplier.supplierNo} · ${po.supplier.name}`} />
            <Row k="联系人" v={po.supplier.contactName ?? "-"} />
            <Row k="电话" v={po.supplier.contactPhone ?? "-"} />
            <Row k="下单日" v={formatDate(po.orderDate)} />
            <Row k="期望到货" v={po.expectedDate ? formatDate(po.expectedDate) : "-"} />
            {po.remark && <Row k="备注" v={po.remark} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>目标分仓</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="车间" v={`${po.workshop.code} · ${po.workshop.name}`} />
            <Row k="地址" v={po.workshop.address ?? "-"} />
            <Row k="联系人" v={po.workshop.contactName ?? "-"} />
            <Row k="电话" v={po.workshop.contactPhone ?? "-"} />
          </CardContent>
        </Card>
      </div>

      <PODetailActions
        poNo={po.poNo}
        status={po.status}
        lines={po.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          sku: l.sku,
          productName: l.productName,
          spec: l.spec,
          quantity: l.quantity,
          receivedQty: l.receivedQty,
          unitPrice: Number(l.unitPrice),
          lineAmount: Number(l.lineAmount),
        }))}
        totalAmount={Number(po.totalAmount)}
      />

      <Card>
        <CardHeader><CardTitle>收货流水 ({movements.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">时间</th><th className="p-3">SKU</th>
              <th className="p-3">名称</th><th className="p-3">类型</th>
              <th className="p-3 text-right">数量</th><th className="p-3 text-right">结存</th>
              <th className="p-3">操作人</th><th className="p-3">备注</th>
            </tr></thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-3 text-xs">{formatDateTime(m.createdAt)}</td>
                  <td className="p-3 font-mono text-xs">{m.sku}</td>
                  <td className="p-3">{m.productName}</td>
                  <td className="p-3 text-xs">{STOCK_MOVEMENT_TYPE_LABEL[m.type]}</td>
                  <td className={`p-3 text-right ${m.quantity >= 0 ? "text-emerald-700" : "text-red-600"}`}>{m.quantity >= 0 ? "+" : ""}{m.quantity}</td>
                  <td className="p-3 text-right">{m.balanceAfter}</td>
                  <td className="p-3 text-xs">{m.operatorName ?? "-"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{m.note ?? "-"}</td>
                </tr>
              ))}
              {movements.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">暂无收货记录</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}

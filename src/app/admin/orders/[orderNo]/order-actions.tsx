"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/** 订单级终局动作（P1-C）：取消（守卫矩阵在服务端）与 SHIPPED 结案归档 */
export function OrderActions({ orderNo, orderStatus, paidAmount }: {
  orderNo: string;
  orderStatus: string;
  paidAmount: number;
}) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const cancellable = ["DRAFT", "PENDING", "MODIFYING", "CONFIRMED", "PARTIALLY_PAID", "PRODUCING", "READY", "PARTIALLY_SHIPPED"].includes(orderStatus);
  const completable = orderStatus === "SHIPPED";

  if (!cancellable && !completable) return null;

  async function cancel(force: boolean) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/orders/${orderNo}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, force: force || undefined }),
      });
      const j = await r.json();
      if (j.code !== 0) { setMsg(j.message); return; }
      setMsg("已取消" + (j.data?.warnings?.length ? `（${j.data.warnings.join("；")}）` : ""));
      setCancelling(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function complete() {
    if (!confirm("确认结案归档？结案后订单进入「已完成」。")) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/orders/${orderNo}/complete`, { method: "POST" });
      const j = await r.json();
      if (j.code !== 0) { setMsg(j.message); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>订单操作</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {cancelling ? (
          <>
            <Label>取消原因 *</Label>
            <Textarea value={reason} rows={2} onChange={(e) => setReason(e.target.value)} placeholder="如：客户改需求 / 录错单 / 项目终止" />
            {paidAmount > 0 && (
              <p className="text-xs text-amber-300">本单已收款 ¥{paidAmount.toFixed(2)}：取消后核销保留、客户余额转预收，退款请线下处理。</p>
            )}
            {msg && <p className="text-xs text-destructive">{msg}</p>}
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" disabled={busy || !reason.trim()} onClick={() => cancel(false)}>确认取消</Button>
              <Button variant="outline" size="sm" onClick={() => setCancelling(false)}>返回</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">若服务端要求二次确认（已部分发货/工单已打包），会在此显示原因——确认后点「强制取消剩余」。</p>
            {msg?.includes("force") && (
              <Button variant="destructive" size="sm" disabled={busy || !reason.trim()} onClick={() => cancel(true)}>强制取消剩余生产</Button>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {completable && (
              <Button variant="outline" className="w-full" disabled={busy} onClick={complete}>结案归档（已签收）</Button>
            )}
            {cancellable && (
              <Button variant="ghost" className="w-full text-destructive hover:bg-destructive/15" disabled={busy} onClick={() => { setCancelling(true); setMsg(""); }}>
                取消订单
              </Button>
            )}
            {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

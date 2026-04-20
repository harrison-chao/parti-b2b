"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ReviewPanel({ orderNo, defaultAmount }: { orderNo: string; defaultAmount: number }) {
  const router = useRouter();
  const [remark, setRemark] = useState("");
  const [suggestedDate, setSuggestedDate] = useState("");
  const [confirmedAmount, setConfirmedAmount] = useState<string>(String(defaultAmount));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "APPROVE" | "REJECT" | "MODIFY") {
    if (action === "REJECT" && !remark.trim()) return setError("驳回需要填写原因");
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`/api/orders/${orderNo}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, remark: remark || null,
          suggestedDeliveryDate: suggestedDate || null,
          confirmedAmount: confirmedAmount ? parseFloat(confirmedAmount) : null,
        }),
      });
      const j = await r.json();
      if (j.code !== 0) { setError(j.message); return; }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>审核操作</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label>审核备注</Label><Textarea value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="驳回时必填" /></div>
        <div><Label>建议交期（可选）</Label><Input type="date" value={suggestedDate} onChange={(e) => setSuggestedDate(e.target.value)} /></div>
        <div><Label>确认金额（可选）</Label><Input type="number" value={confirmedAmount} onChange={(e) => setConfirmedAmount(e.target.value)} /></div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="space-y-2 pt-2 border-t">
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading} onClick={() => act("APPROVE")}>✓ 通过审核</Button>
          <Button className="w-full" variant="outline" disabled={loading} onClick={() => act("MODIFY")}>↻ 需要修改</Button>
          <Button className="w-full" variant="destructive" disabled={loading} onClick={() => act("REJECT")}>✗ 驳回订单</Button>
        </div>
      </CardContent>
    </Card>
  );
}

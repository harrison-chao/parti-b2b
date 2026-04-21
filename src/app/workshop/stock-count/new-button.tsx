"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function NewStockCountBtn() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    if (!confirm("将抓取当前全部库存作为盘点快照，开始吗？")) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/stock-counts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const j = await r.json();
    setBusy(false);
    if (j.code !== 0) { setErr(j.message); return; }
    router.push(`/workshop/stock-count/${j.data.countNo}`);
  }

  return (
    <div className="flex items-center gap-3">
      {err && <span className="text-xs text-red-600">{err}</span>}
      <Button size="sm" onClick={create} disabled={busy}>{busy ? "创建中..." : "发起盘点"}</Button>
    </div>
  );
}

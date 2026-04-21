"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ApproveStockCountButton({ countNo }: { countNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function approve() {
    if (!confirm(`确认审核通过盘点单 ${countNo}？审核后将正式写入库存调整流水。`)) return;
    setBusy(true);
    setMessage("审核中...");
    const res = await fetch(`/api/stock-counts/${countNo}/approve`, { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (json.code !== 0) {
      setMessage("✗ " + json.message);
      return;
    }
    setMessage("✓ 已审核");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={approve} disabled={busy}>{busy ? "审核中..." : "审核通过"}</Button>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 车间快捷流转按钮：POST advance:true，一次点按完成状态推进 */
export function AdvanceButton({ workOrderNo, label, variant = "default", className }: {
  workOrderNo: string; label: string; variant?: "default" | "outline" | "secondary"; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/work-orders/${workOrderNo}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advance: true }),
      });
      const rj = await res.json();
      if (!rj.ok) { setErr(rj.message ?? "推进失败"); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button size="sm" variant={variant} disabled={busy} onClick={go} className={className}>{busy ? "…" : label}</Button>
      {err && <span className="text-[10px] text-red-500 max-w-40 text-right">{err}</span>}
    </span>
  );
}

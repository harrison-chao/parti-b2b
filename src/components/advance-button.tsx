"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** 车间快捷流转按钮：POST advance:true，一次点按完成状态推进。
 *  开工遇缺料时提供「强制开工（记录缺料）」二次入口。 */
export function AdvanceButton({ workOrderNo, label, variant = "default", className }: {
  workOrderNo: string; label: string; variant?: "default" | "outline" | "secondary"; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [canForce, setCanForce] = useState(false);

  async function go(force = false) {
    setBusy(true); setErr(null);
    if (force && !confirm("确认缺料强制开工？缺料明细会记录到工单备注。")) { setBusy(false); return; }
    try {
      const res = await fetch(`/api/work-orders/${workOrderNo}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advance: true, ...(force ? { force: true } : {}) }),
      });
      const rj = await res.json();
      if (rj.code !== 0) {
        setErr(rj.message ?? "推进失败");
        if (typeof rj.message === "string" && rj.message.includes("强制开工")) setCanForce(true);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button size="sm" variant={variant} disabled={busy} onClick={() => go(false)} className={className}>{busy ? "…" : label}</Button>
      {canForce && (
        <button className="text-[10px] text-amber-300 underline" onClick={() => go(true)}>缺料强制开工 →</button>
      )}
      {err && <span className="text-[10px] text-red-500 max-w-40 text-right">{err}</span>}
    </span>
  );
}

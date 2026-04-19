"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SubmitBtn({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function submit() {
    setLoading(true);
    const r = await fetch(`/api/orders/${orderNo}/submit`, { method: "POST" });
    const j = await r.json();
    setLoading(false);
    if (j.code !== 0) { alert(j.message); return; }
    router.refresh();
  }
  return <Button onClick={submit} disabled={loading}>{loading ? "提交中..." : "提交审核"}</Button>;
}

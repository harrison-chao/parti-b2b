"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export function ThresholdEditor({ id, initial }: { id: string; initial: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(initial || ""));
  const [status, setStatus] = useState("");

  async function save() {
    setStatus("保存中");
    const res = await fetch(`/api/inventory/${id}/threshold`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lowStockThreshold: Number(value || 0) }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setStatus("✗");
      return;
    }
    setStatus("✓");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        className="h-8 w-24 text-right"
        min={0}
        type="number"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <span className="w-5 text-xs text-muted-foreground">{status}</span>
    </div>
  );
}

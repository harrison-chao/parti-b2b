"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function StampForm({ initialUrl, companyName }: { initialUrl: string | null; companyName: string }) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");

  async function upload(file: File) {
    setUploading(true);
    setStatus("上传中...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/uploads/stamp", { method: "POST", body: fd });
      const j = await r.json();
      if (j.code !== 0) { setStatus("✗ " + j.message); return; }
      const newUrl = j.data.url;
      const newPath = j.data.path;
      const r2 = await fetch("/api/dealer/me/stamp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stampUrl: newUrl, storagePath: newPath }),
      });
      const j2 = await r2.json();
      if (j2.code !== 0) { setStatus("✗ " + j2.message); return; }
      setUrl(newUrl);
      setStatus("✓ 已保存");
      setTimeout(() => setStatus(""), 3000);
    } finally {
      setUploading(false);
    }
  }

  async function remove() {
    setStatus("保存中...");
    const r = await fetch("/api/dealer/me/stamp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stampUrl: null, storagePath: null }),
    });
    const j = await r.json();
    if (j.code !== 0) { setStatus("✗ " + j.message); return; }
    setUrl(null);
    setStatus("✓ 已移除");
    setTimeout(() => setStatus(""), 3000);
  }

  return (
    <div className="space-y-4">
      {url ? (
        <div className="flex items-center gap-4">
          <img src={url} alt="合同章" className="w-32 h-32 object-contain border rounded bg-white" />
          <div className="text-sm space-y-1">
            <div className="text-muted-foreground">{companyName}</div>
            <Button variant="outline" size="sm" onClick={remove}>移除</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">尚未上传合同章</p>
      )}
      <div className="flex items-center gap-3">
        <Label className="cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
          />
          <span className="inline-flex items-center h-9 px-4 rounded-md bg-slate-900 text-white text-sm">
            {uploading ? "上传中..." : (url ? "替换合同章" : "上传合同章")}
          </span>
        </Label>
        {status && <span className="text-sm text-emerald-700">{status}</span>}
      </div>
    </div>
  );
}

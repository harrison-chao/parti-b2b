"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/utils";

type Cost = {
  totalCost: number;
  materialCost: number;
  surfaceCost: number;
  processingCost: number;
  connectorCost: number;
  retailPrice: number;
  actualWeight: number;
};

export function OrderLineCostRow({
  orderNo,
  line,
  costBreakdown,
}: {
  orderNo: string;
  line: {
    id: string;
    lineNo: number;
    lineType: string;
    productName: string;
    sku: string;
    preprocessing: string | null;
    drawingUrl: string | null;
    drawingFileName: string | null;
    quantity: number;
    unitPrice: number;
    lineAmount: number;
    includedInProfit: boolean;
  };
  costBreakdown: Cost | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [included, setIncluded] = useState(line.includedInProfit);
  const [isPending, startTransition] = useTransition();

  // For OUTSOURCED lines without a calcPricing breakdown, cost = unitPrice (pass-through)
  const effectiveUnitCost = costBreakdown?.totalCost ?? (line.lineType === "OUTSOURCED" ? line.unitPrice : null);
  const profit = effectiveUnitCost != null ? line.unitPrice - effectiveUnitCost : null;
  const excluded = !included;

  async function toggle(next: boolean) {
    setIncluded(next);
    const r = await fetch(`/api/orders/${orderNo}/lines/${line.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includedInProfit: next }),
    });
    const j = await r.json();
    if (j.code !== 0) {
      setIncluded(!next);
      alert("切换失败: " + j.message);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <>
      <tr className={`border-b ${excluded ? "bg-slate-50 text-muted-foreground" : ""}`}>
        <td className="p-3">{line.lineNo}</td>
        <td className="p-3">
          <div className="flex items-center gap-2">
            <span>{line.productName}</span>
            {line.lineType === "OUTSOURCED" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">外购件</span>
            )}
          </div>
          {line.preprocessing && <div className="text-xs text-muted-foreground">{line.preprocessing}</div>}
          {line.drawingUrl && (
            <a href={line.drawingUrl} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline">
              📎 图纸 {line.drawingFileName ?? ""}
            </a>
          )}
        </td>
        <td className="p-3 font-mono text-xs">{line.sku}</td>
        <td className="p-3 text-right">{line.quantity}</td>
        <td className="p-3 text-right">{effectiveUnitCost != null ? formatMoney(effectiveUnitCost) : "-"}</td>
        <td className="p-3 text-right">{formatMoney(line.unitPrice)}</td>
        <td className={`p-3 text-right ${profit == null || excluded ? "" : profit >= 0 ? "text-blue-700" : "text-red-600"}`}>
          {profit != null ? formatMoney(profit) : "-"}
        </td>
        <td className="p-3 text-right font-medium">{formatMoney(line.lineAmount)}</td>
        <td className="p-3">
          <div className="flex flex-col gap-1 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={included}
                disabled={isPending}
                onChange={(e) => toggle(e.target.checked)}
              />
              <span title="勾选后该行纳入利润核算">计入利润</span>
            </label>
            {costBreakdown && (
              <button onClick={() => setOpen(!open)} className="text-blue-600 hover:underline text-left">
                {open ? "收起" : "展开"}
              </button>
            )}
          </div>
        </td>
      </tr>
      {open && costBreakdown && (
        <tr className="bg-amber-50 border-b">
          <td colSpan={9} className="p-3">
            <div className="text-xs font-semibold text-amber-800 mb-2">成本构成（单位成本 {formatMoney(costBreakdown.totalCost)}/根）</div>
            <div className="grid grid-cols-6 gap-3 text-xs">
              <div><div className="text-muted-foreground">实际耗料重</div><div className="font-mono">{costBreakdown.actualWeight} kg</div></div>
              <div><div className="text-muted-foreground">材料成本</div><div className="font-mono">{formatMoney(costBreakdown.materialCost)}</div></div>
              <div><div className="text-muted-foreground">表面处理</div><div className="font-mono">{formatMoney(costBreakdown.surfaceCost)}</div></div>
              <div><div className="text-muted-foreground">加工费</div><div className="font-mono">{formatMoney(costBreakdown.processingCost)}</div></div>
              <div><div className="text-muted-foreground">连接件</div><div className="font-mono">{formatMoney(costBreakdown.connectorCost)}</div></div>
              <div><div className="text-muted-foreground">零售价参考</div><div className="font-mono">{formatMoney(costBreakdown.retailPrice)}</div></div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

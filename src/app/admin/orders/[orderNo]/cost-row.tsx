"use client";
import { useState } from "react";
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
  line,
  costBreakdown,
}: {
  line: {
    lineNo: number;
    productName: string;
    sku: string;
    preprocessing: string | null;
    quantity: number;
    unitPrice: number;
    lineAmount: number;
  };
  costBreakdown: Cost | null;
}) {
  const [open, setOpen] = useState(false);
  const lineCost = costBreakdown ? costBreakdown.totalCost * line.quantity : null;
  const profit = lineCost != null ? line.unitPrice - costBreakdown!.totalCost : null;

  return (
    <>
      <tr className="border-b">
        <td className="p-3">{line.lineNo}</td>
        <td className="p-3">
          <div>{line.productName}</div>
          {line.preprocessing && <div className="text-xs text-muted-foreground">{line.preprocessing}</div>}
        </td>
        <td className="p-3 font-mono text-xs">{line.sku}</td>
        <td className="p-3 text-right">{line.quantity}</td>
        <td className="p-3 text-right">{costBreakdown ? formatMoney(costBreakdown.totalCost) : "-"}</td>
        <td className="p-3 text-right">{formatMoney(line.unitPrice)}</td>
        <td className={`p-3 text-right ${profit == null ? "" : profit >= 0 ? "text-blue-700" : "text-red-600"}`}>
          {profit != null ? formatMoney(profit) : "-"}
        </td>
        <td className="p-3 text-right font-medium">{formatMoney(line.lineAmount)}</td>
        <td className="p-3">
          {costBreakdown && (
            <button onClick={() => setOpen(!open)} className="text-xs text-blue-600 hover:underline">
              {open ? "收起" : "展开"}
            </button>
          )}
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

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { buildCutList } from "@/lib/cutlist";
import { AutoPrint } from "@/components/auto-print";

export default async function CutListPrintPage() {
  const session = await auth();
  if (!session?.user?.workshopId) redirect("/login");
  const { rows, orderCount, generatedAt } = await buildCutList(session.user.workshopId);
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  return (
    <div className="p-6 max-w-[210mm] mx-auto text-[12px]">
      <AutoPrint />
      <div className="flex justify-between items-baseline border-b-2 border-black pb-2 mb-3">
        <h1 className="text-lg font-bold">截料清单</h1>
        <span className="text-gray-500">
          {orderCount} 张在产单 · {totalQty} 件 · 生成于 {new Date(generatedAt).toLocaleString("zh-CN")}
        </span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-black">
            <th className="p-1.5 text-left">表面处理</th><th className="p-1.5 text-left">规格</th>
            <th className="p-1.5 text-right">切长(mm)</th><th className="p-1.5 text-right">≈寸</th>
            <th className="p-1.5 text-left">工序</th><th className="p-1.5 text-right">数量</th><th className="p-1.5 text-right">涉及单</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-gray-300">
              <td className="p-1.5">{r.surface}</td>
              <td className="p-1.5 font-mono">{r.sku}</td>
              <td className="p-1.5 text-right">{r.lengthMm ?? "—"}</td>
              <td className="p-1.5 text-right text-gray-500">{r.lengthInch}</td>
              <td className="p-1.5">{r.processes.filter((c) => c !== "L").join("/") || "—"}</td>
              <td className="p-1.5 text-right font-bold">{r.quantity}</td>
              <td className="p-1.5 text-right text-gray-500">{r.orderCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[10px] text-gray-400">工序记号：D=铣销子孔 EM=预埋连接件 T=攻丝 CH=倒角 · 寸=英寸(25.4mm)</p>
    </div>
  );
}

import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { buildCutList } from "@/lib/cutlist";

export default async function CutListPage() {
  const session = await auth();
  if (!session?.user?.workshopId) redirect("/login");
  const { rows, orderCount } = await buildCutList(session.user.workshopId);
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">截料清单</h1>
          <p className="text-xs text-muted-foreground">{orderCount} 张在产单聚合 · {rows.length} 种规格 · 共 {totalQty} 件</p>
        </div>
        <Link href="/workshop/cutlist/print" className="text-sm text-sky-400 hover:underline">打印 A4 →</Link>
      </div>
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b"><tr className="text-left">
            <th className="p-2">表面处理</th><th className="p-2">规格</th><th className="p-2">切长(mm)</th>
            <th className="p-2">≈寸</th><th className="p-2">工序</th><th className="p-2 text-right">数量</th><th className="p-2 text-right">涉及单</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b">
                <td className="p-2">{r.surface}</td>
                <td className="p-2 font-mono text-xs">{r.sku}</td>
                <td className="p-2">{r.lengthMm ?? "—"}</td>
                <td className="p-2 text-muted-foreground">{r.lengthInch}</td>
                <td className="p-2 text-xs">{r.processes.filter((c) => c !== "L").join("/") || "—"}</td>
                <td className="p-2 text-right font-bold">{r.quantity}</td>
                <td className="p-2 text-right text-xs text-muted-foreground">{r.orderCount}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">当前没有待截料的在产单</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

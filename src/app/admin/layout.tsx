import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dealer");
  const items = [
    { href: "/admin", label: "驾驶舱" },
    { href: "/admin/orders", label: "销售订单" },
    { href: "/admin/work-orders", label: "加工制单" },
    { href: "/admin/dealers", label: "经销商" },
    { href: "/admin/workshops", label: "加工车间" },
    { href: "/admin/products", label: "产品目录" },
    { href: "/admin/suppliers", label: "供应商" },
    { href: "/admin/purchase-orders", label: "采购单" },
    { href: "/admin/stock-counts", label: "盘点审核" },
    { href: "/admin/reconcile/dealers", label: "经销商对账" },
    { href: "/admin/reconcile/suppliers", label: "供应商对账" },
    { href: "/admin/pricing", label: "报价成本" },
    { href: "/admin/settings", label: "系统设置" },
  ];
  return (
    <div className="min-h-screen">
      <Nav user={{ name: session.user.name, role: "管理员" }} items={items} />
      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}

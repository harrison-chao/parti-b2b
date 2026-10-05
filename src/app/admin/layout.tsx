import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { roleHome } from "@/lib/utils";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "ADMIN") redirect(roleHome(session.user.role));
  const items = [
    { href: "/admin", label: "驾驶舱", icon: "dashboard" },
    { href: "/admin/orders/new", label: "代下单", icon: "neworder" },
    { href: "/admin/orders", label: "销售订单", icon: "orders" },
    { href: "/admin/shipments/new", label: "发货登记", icon: "ship" },
    { href: "/admin/work-orders", label: "加工制单", icon: "dispatch" },
    { href: "/admin/dealers", label: "客户", icon: "users" },
    { href: "/admin/products", label: "产品目录", icon: "products" },
    { href: "/admin/inventory", label: "库存预警", icon: "inventory" },
    { href: "/admin/material-demand", label: "原料需求", icon: "inventory" },
    { href: "/admin/users", label: "账号管理", icon: "users" },
  ];
  const secondaryItems = [
    { href: "/admin/workshops", label: "加工车间", icon: "factory" },
    { href: "/admin/suppliers", label: "供应商", icon: "suppliers" },
    { href: "/admin/purchase-orders", label: "采购单", icon: "purchase" },
    { href: "/admin/stock-counts", label: "盘点审核", icon: "stockcount" },
    { href: "/admin/reconcile/dealers", label: "客户对账", icon: "reconcile" },
    { href: "/admin/reconcile/suppliers", label: "供应商对账", icon: "reconcile" },
    { href: "/admin/pricing", label: "报价成本", icon: "pricing" },
    { href: "/admin/audit", label: "审计日志", icon: "audit" },
    { href: "/admin/settings", label: "系统设置", icon: "settings" },
    { href: "/admin/account", label: "我的账号", icon: "account" },
  ];
  return (
    <div className="min-h-screen">
      <Nav user={{ name: session.user.name, role: "管理员" }} items={items} secondaryItems={secondaryItems} />
      <main className="container py-5 md:py-8 lg:pl-64">{children}</main>
    </div>
  );
}

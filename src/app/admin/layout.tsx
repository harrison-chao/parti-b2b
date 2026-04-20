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
    { href: "/admin/dealers", label: "经销商" },
    { href: "/admin/pricing", label: "报价成本" },
    { href: "/admin/settings", label: "系统设置" },
  ];
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav user={{ name: session.user.name, role: "管理员" }} items={items} />
      <main className="container py-6">{children}</main>
    </div>
  );
}

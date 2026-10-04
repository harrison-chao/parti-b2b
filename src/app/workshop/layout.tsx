import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "WORKSHOP") redirect("/");
  const items = [
    { href: "/workshop", label: "作业队列", icon: "dashboard" },
    { href: "/workshop/ship", label: "发货登记", icon: "ship" },
    { href: "/workshop/cutlist", label: "截料清单", icon: "cutlist" },
    { href: "/workshop/history", label: "历史加工", icon: "history" },
    { href: "/workshop/inventory", label: "库存", icon: "inventory" },
    { href: "/workshop/stock-count", label: "盘点", icon: "stockcount" },
    { href: "/workshop/account", label: "账号设置", icon: "account" },
  ];
  return (
    <div className="min-h-screen">
      <Nav user={{ name: session.user.name, role: "车间" }} items={items} dock />
      <main className="container py-5 md:py-8 lg:pl-64 pb-24 lg:pb-8">{children}</main>
    </div>
  );
}

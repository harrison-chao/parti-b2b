import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function WorkshopLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "WORKSHOP") redirect("/");
  const items = [
    { href: "/workshop", label: "我的加工单" },
    { href: "/workshop/history", label: "历史加工" },
    { href: "/workshop/inventory", label: "库存" },
    { href: "/workshop/stock-count", label: "盘点" },
  ];
  return (
    <div className="min-h-screen">
      <Nav user={{ name: session.user.name, role: "车间" }} items={items} />
      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}

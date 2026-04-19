import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function DealerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "DEALER") redirect("/ops");
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav
        user={{ name: session.user.name, role: "经销商" }}
        items={[
          { href: "/dealer", label: "工作台" },
          { href: "/dealer/quote", label: "报价计算器" },
          { href: "/dealer/catalog", label: "产品目录" },
          { href: "/dealer/orders", label: "我的订单" },
        ]}
      />
      <main className="container py-6">{children}</main>
    </div>
  );
}

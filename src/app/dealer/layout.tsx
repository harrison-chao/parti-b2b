import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function DealerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "DEALER") redirect("/admin");
  return (
    <div className="min-h-screen">
      <Nav
        user={{ name: session.user.name, role: "经销商" }}
        items={[
          { href: "/dealer", label: "工作台", icon: "dashboard" },
          { href: "/dealer/quote", label: "报价下单", icon: "quote" },
          { href: "/dealer/orders", label: "我的订单", icon: "orders" },
          { href: "/dealer/crm", label: "客户 CRM", icon: "crm" },
          { href: "/dealer/settings", label: "合同章", icon: "file" },
          { href: "/dealer/account", label: "账号设置", icon: "account" },
        ]}
      />
      <main className="container py-5 md:py-8 lg:pl-64">{children}</main>
    </div>
  );
}

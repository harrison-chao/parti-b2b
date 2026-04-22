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
          { href: "/dealer", label: "工作台" },
          { href: "/dealer/quote", label: "报价下单" },
          { href: "/dealer/orders", label: "我的订单" },
          { href: "/dealer/settings", label: "合同章" },
          { href: "/dealer/account", label: "账号设置" },
        ]}
      />
      <main className="container py-6 md:py-8">{children}</main>
    </div>
  );
}

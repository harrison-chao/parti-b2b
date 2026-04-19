import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "OPS" && session.user.role !== "ADMIN") redirect("/dealer");
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav
        user={{ name: session.user.name, role: session.user.role === "ADMIN" ? "管理员" : "运营" }}
        items={[
          { href: "/ops", label: "驾驶舱" },
          { href: "/ops/orders", label: "销售订单" },
          { href: "/ops/dealers", label: "经销商" },
        ]}
      />
      <main className="container py-6">{children}</main>
    </div>
  );
}

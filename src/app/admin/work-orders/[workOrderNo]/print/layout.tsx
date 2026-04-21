import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  return <div className="bg-white min-h-screen">{children}</div>;
}

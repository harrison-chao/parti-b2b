import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function WorkshopPrintLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user.workshopId) redirect("/login");
  return <div className="bg-white min-h-screen">{children}</div>;
}

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { roleHome } from "@/lib/utils";

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");
  redirect(roleHome(session.user.role));
}

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadSettings } from "@/lib/settings";
import { SettingsForm } from "./form";

export default async function SettingsPage() {
  const session = await auth();
  if (session!.user.role !== "ADMIN") redirect("/admin");
  const s = await loadSettings();
  return <SettingsForm initial={s} />;
}

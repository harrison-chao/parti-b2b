import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { loadBackupHistory } from "@/lib/backups";

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return fail("仅管理员可查看备份记录", 403, 403);
  const backups = await loadBackupHistory();
  return ok({ backups });
}

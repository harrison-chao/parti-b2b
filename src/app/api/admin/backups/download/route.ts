import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { loadBackupHistory } from "@/lib/backups";
import { createBackupDownloadUrl } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return fail("仅管理员可下载备份", 403, 403);

  const path = req.nextUrl.searchParams.get("path");
  if (!path) return fail("缺少备份路径");

  const backups = await loadBackupHistory();
  const exists = backups.some((backup) => backup.status === "SUCCESS" && backup.path === path);
  if (!exists) return fail("备份记录不存在或尚未成功生成", 404, 404);

  try {
    const url = await createBackupDownloadUrl(path);
    return ok({ url, expiresInSeconds: 600 });
  } catch (error: any) {
    return fail(error?.message ?? "生成下载链接失败", 500, 500);
  }
}

import { prisma } from "@/lib/prisma";
import { saveSetting } from "@/lib/settings";

export const BACKUP_HISTORY_KEY = "backupHistory";
export const BACKUP_HISTORY_LIMIT = 30;

export type BackupHistoryItem = {
  id: string;
  bucket: string;
  path: string;
  status: "SUCCESS" | "FAILED";
  generatedAt: string;
  generatedBy: string;
  error?: string;
  counts?: Record<string, number>;
};

export async function loadBackupHistory(): Promise<BackupHistoryItem[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: BACKUP_HISTORY_KEY } });
  if (!row || !Array.isArray(row.value)) return [];
  return row.value as BackupHistoryItem[];
}

export async function appendBackupHistory(item: BackupHistoryItem) {
  const current = await loadBackupHistory();
  const next = [item, ...current].slice(0, BACKUP_HISTORY_LIMIT);
  await saveSetting(BACKUP_HISTORY_KEY, next, item.generatedBy);
  return next;
}

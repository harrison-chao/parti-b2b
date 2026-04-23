import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient | PrismaClient;

type AuditActor = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  detail?: unknown;
  actor?: AuditActor | null;
  targetUserId?: string | null;
  targetDealerId?: string | null;
  targetWorkshopId?: string | null;
};

export async function logAudit(input: AuditInput, db: Tx = prisma) {
  return db.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      detail: input.detail === undefined ? Prisma.JsonNull : (input.detail as Prisma.InputJsonValue),
      actorUserId: input.actor?.id ?? null,
      actorName: input.actor?.name ?? null,
      actorEmail: input.actor?.email ?? null,
      actorRole: (input.actor?.role as UserRole | null | undefined) ?? null,
      targetUserId: input.targetUserId ?? null,
      targetDealerId: input.targetDealerId ?? null,
      targetWorkshopId: input.targetWorkshopId ?? null,
    },
  });
}

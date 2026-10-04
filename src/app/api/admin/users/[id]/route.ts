import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { activationExpiresAt, buildActivationLink, createActivationToken } from "@/lib/account-activation";

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

async function assertNotLastActiveAdmin(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: fail("账号不存在", 404, 404) };
  if (target.role === "ADMIN" && target.status === "ACTIVE") {
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (activeAdmins <= 1) return { error: fail("不能停用/删除最后一个启用中的管理员") };
  }
  return { target };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可操作", 403, 403);
  if (params.id === session.user.id) return fail("不能停用自己的账号");

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);

  const toStatus = parsed.data.status;
  const guard = await assertNotLastActiveAdmin(params.id);
  if ("error" in guard && guard.error) return guard.error;
  const target = guard.target!;

  // 启用 = 恢复登录资格 + 重发启用链接（停用时凭据已作废，必须重设密码）
  const activation = toStatus === "ACTIVE" ? createActivationToken() : null;
  const expiresAt = activation ? activationExpiresAt() : null;

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      status: toStatus,
      ...(toStatus === "INACTIVE"
        ? {
            // 停用同时作废凭据与激活令牌（既有 JWT 到期自然失效）
            password: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
            activationTokenHash: null,
            activationTokenExpiresAt: null,
            activationTokenCreatedAt: null,
          }
        : activation
          ? {
              mustChangePassword: true,
              activationTokenHash: activation.tokenHash,
              activationTokenExpiresAt: expiresAt,
              activationTokenCreatedAt: new Date(),
            }
          : {}),
    },
    select: { id: true, email: true, name: true, role: true, status: true, mustChangePassword: true, activationTokenExpiresAt: true, updatedAt: true },
  });

  await logAudit({
    action: toStatus === "INACTIVE" ? "USER_DISABLE" : "USER_ENABLE",
    entityType: "User",
    entityId: updated.id,
    targetUserId: updated.id,
    summary: `${toStatus === "INACTIVE" ? "停用" : "启用"}账号：${updated.email}`,
    detail: { targetEmail: updated.email, targetRole: updated.role },
    actor: session.user,
  });

  return ok({
    user: updated,
    ...(activation ? { activationLink: buildActivationLink(activation.token) } : {}),
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可删除账号", 403, 403);
  if (params.id === session.user.id) return fail("不能删除自己的账号");

  const guard = await assertNotLastActiveAdmin(params.id);
  if ("error" in guard && guard.error) return guard.error;
  const target = guard.target!;

  // 有业务留痕的账号不可硬删（保审计链）：只允许停用。
  // 只统计该账号【操作过】的记录（actor/creator）；针对它本身的账号生命周期审计（USER_CREATE 等）不算——删除动作本身会另写 USER_DELETE 留痕。
  const [orderCount, shipmentCount, woEventCount, auditCount, comboCount] = await Promise.all([
    prisma.salesOrder.count({ where: { createdByUserId: target.id } }),
    prisma.shipment.count({ where: { createdByUserId: target.id } }),
    prisma.workOrderEvent.count({ where: { operatorUserId: target.id } }),
    prisma.auditLog.count({ where: { actorUserId: target.id } }),
    prisma.orderCombo.count({ where: { createdByUserId: target.id } }),
  ]);
  const refs = orderCount + shipmentCount + woEventCount + auditCount + comboCount;
  if (refs > 0) {
    return fail(`该账号有 ${refs} 条操作记录（订单 ${orderCount}、发货 ${shipmentCount}、工单事件 ${woEventCount}、审计 ${auditCount}、组合 ${comboCount}），删除会破坏留痕——请改用「停用」`, 409, 409);
  }

  await prisma.user.delete({ where: { id: target.id } });
  await logAudit({
    action: "USER_DELETE",
    entityType: "User",
    entityId: target.id,
    targetUserId: target.id,
    summary: `删除无业务记录账号：${target.email}`,
    detail: { targetEmail: target.email, targetRole: target.role },
    actor: session.user,
  });

  return ok({ deleted: true });
}

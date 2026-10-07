import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

export function ok<T>(data: T, message = "success") {
  return NextResponse.json({ code: 0, message, data });
}
export function fail(message: string, code = 1, status = 400) {
  return NextResponse.json({ code, message, data: null }, { status });
}

/**
 * 统一鉴权入口（新路由强制使用，存量渐进替换）：
 *   const guard = await requireRole("ADMIN");
 *   if (guard.response) return guard.response;
 *   const session = guard.session;
 * 失败时直接 return guard.response（401 未登录 / 403 角色不符），措辞全库统一。
 */
export async function requireSession(): Promise<{ session: Session; response: null } | { session: null; response: NextResponse }> {
  const session = await auth();
  if (!session) return { session: null, response: fail("未登录", 401, 401) };
  return { session, response: null };
}

export async function requireRole(...roles: Array<"ADMIN" | "WORKSHOP" | "DEALER">): Promise<{ session: Session; response: null } | { session: null; response: NextResponse }> {
  const session = await auth();
  if (!session) return { session: null, response: fail("未登录", 401, 401) };
  if (!roles.includes(session.user.role)) {
    const label = roles.length === 1
      ? ({ ADMIN: "仅管理员可操作", WORKSHOP: "仅车间账号可操作", DEALER: "仅经销商账号可操作" } as const)[roles[0]]
      : "无权访问";
    return { session: null, response: fail(label, 403, 403) };
  }
  return { session, response: null };
}

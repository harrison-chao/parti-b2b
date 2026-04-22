import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { loadSettings, saveSetting } from "@/lib/settings";
import { ok, fail } from "@/lib/api";

export async function GET() {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  const s = await loadSettings();
  if (session.user.role === "DEALER") {
    return ok({
      surfaceProcesses: s.surfaceProcesses,
      surfaceColors: s.surfaceColors,
      processingOperations: s.processingOperations,
    });
  }
  return ok(s);
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "ADMIN") return fail("仅管理员可修改设置", 403, 403);

  const body = await req.json();
  const { key, value } = body ?? {};
  const allowed = [
    "surfaceProcesses",
    "surfaceColors",
    "processingOperations",
    "discountRates",
    "pricingFields",
    "carriers",
    "stampTemplate",
  ];
  if (!allowed.includes(key)) return fail("无效的 key");
  // stampTemplate may be explicitly set to null to remove the saved stamp.
  if (value === undefined) return fail("value 不能为空");
  if (value === null && key !== "stampTemplate") return fail("value 不能为空");

  await saveSetting(key, value, session.user.email);
  return ok({ key, value });
}

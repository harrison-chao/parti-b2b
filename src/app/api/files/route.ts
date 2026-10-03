import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createDrawingSignedUrl } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * 统一的图纸/合同章访问入口（私有桶）。
 * 库中存储的稳定地址为 /api/files?path=<storage path>；
 * 本路由校验登录态与路径合法性后，302 到短时签名 URL。
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ code: 401, message: "未登录" }, { status: 401 });

  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) {
    return NextResponse.json({ code: 400, message: "非法路径" }, { status: 400 });
  }

  try {
    const signed = await createDrawingSignedUrl(path, 300);
    return NextResponse.redirect(signed, 302);
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e?.message ?? "获取文件失败" }, { status: 500 });
  }
}

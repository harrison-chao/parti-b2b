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

  // 资源归属：stamps/{dealerId}/... 合同章仅本人与管理员；
  // 图纸按上传前缀（dealerId 或上传者 userId）隔离，经销商只能取自己前缀下的文件；
  // 车间可看图纸（生产所需）但不可看任何合同章。
  const role = session.user.role;
  const isStamp = path.startsWith("stamps/");
  if (role === "WORKSHOP" && isStamp) {
    return NextResponse.json({ code: 403, message: "无权访问该文件" }, { status: 403 });
  }
  if (role === "DEALER") {
    const ownStamp = `stamps/${session.user.dealerId}/`;
    const ownDrawing = `${session.user.dealerId}/`;
    if (isStamp ? !path.startsWith(ownStamp) : !path.startsWith(ownDrawing)) {
      return NextResponse.json({ code: 403, message: "无权访问该文件" }, { status: 403 });
    }
  }

  try {
    const signed = await createDrawingSignedUrl(path, 300);
    return NextResponse.redirect(signed, 302);
  } catch (e: any) {
    return NextResponse.json({ code: 500, message: e?.message ?? "获取文件失败" }, { status: 500 });
  }
}

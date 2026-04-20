import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { uploadDrawing, ALLOWED_DRAWING_EXTS, MAX_DRAWING_BYTES } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少文件");

  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_DRAWING_EXTS.includes(ext)) {
    return fail(`仅支持 ${ALLOWED_DRAWING_EXTS.join("/")} 格式`);
  }
  if (file.size > MAX_DRAWING_BYTES) {
    return fail(`文件超过 ${MAX_DRAWING_BYTES / 1024 / 1024}MB 限制`);
  }

  const prefix = session.user.dealerId ?? session.user.id ?? "misc";
  try {
    const { url, path } = await uploadDrawing(file, prefix);
    return ok({ url, path, fileName: file.name });
  } catch (e: any) {
    return fail(e?.message ?? "上传失败", 500, 500);
  }
}

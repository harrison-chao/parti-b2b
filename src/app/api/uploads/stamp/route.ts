import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { ok, fail } from "@/lib/api";
import { uploadImage, ALLOWED_IMAGE_EXTS, MAX_IMAGE_BYTES } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  // Admin uploads master stamp; dealers upload their own stamp.
  if (session.user.role !== "ADMIN" && session.user.role !== "DEALER") {
    return fail("无权", 403, 403);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("缺少文件");

  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.includes(ext)) {
    return fail(`仅支持 ${ALLOWED_IMAGE_EXTS.join("/")} 格式`);
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return fail(`文件超过 ${MAX_IMAGE_BYTES / 1024 / 1024}MB 限制`);
  }

  const prefix = `stamps/${session.user.dealerId ?? session.user.id ?? "admin"}`;
  try {
    const { url, path } = await uploadImage(file, prefix);
    return ok({ url, path, fileName: file.name });
  } catch (e: any) {
    return fail(e?.message ?? "上传失败", 500, 500);
  }
}

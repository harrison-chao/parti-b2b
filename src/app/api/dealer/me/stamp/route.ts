import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  stampUrl: z.string().url().nullable(),
  // storagePath is required when stampUrl is set; ties the upload to this dealer.
  storagePath: z.string().optional().nullable(),
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) return fail("未登录", 401, 401);
  if (session.user.role !== "DEALER" || !session.user.dealerId) return fail("仅经销商可操作", 403, 403);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("参数错误: " + parsed.error.message);
  const { stampUrl, storagePath } = parsed.data;
  if (stampUrl) {
    // Prevent dealer from binding another dealer's public stamp URL.
    // The upload route always puts stamps under `stamps/${dealerId}/...`.
    const expectedPrefix = `stamps/${session.user.dealerId}/`;
    if (!storagePath || !storagePath.startsWith(expectedPrefix)) {
      return fail("仅可绑定本账号上传的合同章", 403, 403);
    }
  }
  const d = await prisma.dealer.update({
    where: { id: session.user.dealerId },
    data: { stampUrl: stampUrl },
  });
  return ok({ stampUrl: d.stampUrl });
}

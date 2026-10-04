import { prisma } from "@/lib/prisma";
import { genOrderNo } from "@/lib/utils";

/**
 * 对外展示单号（D4 决策）：Base 式 YYYYMMDD####，按日连续序列。
 * 内部 SO- 单号仍由 genOrderNo 生成，两者并存：displayOrderNo 给客户看，orderNo 做主键。
 */
export async function genDisplayOrderNo(): Promise<string> {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const last = await prisma.salesOrder.findFirst({
    where: { displayOrderNo: { startsWith: ymd } },
    orderBy: { displayOrderNo: "desc" },
    select: { displayOrderNo: true },
  });
  const seq = last?.displayOrderNo ? parseInt(last.displayOrderNo.slice(8), 10) + 1 : 1;
  return `${ymd}${String(seq).padStart(4, "0")}`;
}

export { genOrderNo };

import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/api";
import { parseCsv } from "@/lib/csv";

const CUSTOMER_TYPE_MAP: Record<string, "INDIVIDUAL" | "COMPANY" | "DESIGNER" | "CONTRACTOR"> = {
  INDIVIDUAL: "INDIVIDUAL",
  COMPANY: "COMPANY",
  DESIGNER: "DESIGNER",
  CONTRACTOR: "CONTRACTOR",
  个人业主: "INDIVIDUAL",
  公司: "COMPANY",
  装企: "COMPANY",
  "公司/装企": "COMPANY",
  设计师: "DESIGNER",
  工装总包: "CONTRACTOR",
};

const STAGE_MAP: Record<string, "LEAD" | "POTENTIAL" | "QUOTED" | "DEAL" | "LOST"> = {
  LEAD: "LEAD",
  POTENTIAL: "POTENTIAL",
  QUOTED: "QUOTED",
  DEAL: "DEAL",
  LOST: "LOST",
  线索: "LEAD",
  潜客: "POTENTIAL",
  已报价: "QUOTED",
  已成交: "DEAL",
  "战败/流失": "LOST",
  流失: "LOST",
};

const INTENT_MAP: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  高意向: "HIGH",
  中意向: "MEDIUM",
  低意向: "LOW",
  高: "HIGH",
  中: "MEDIUM",
  低: "LOW",
};

function dealerIdFromSession(session: any) {
  if (!session || session.user.role !== "DEALER" || !session.user.dealerId) return null;
  return session.user.dealerId;
}

function pick(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return "";
}

function parseAmount(value: string) {
  const normalized = value.replace(/[¥,\s]/g, "");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const dealerId = dealerIdFromSession(session);
  if (!dealerId) return fail("仅经销商可导入 CRM 客户", 403, 403);

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return fail("请上传 CSV 文件");

  const rows = parseCsv(await file.text());
  if (rows.length < 2) return fail("CSV 至少需要表头和一行客户数据");
  if (rows.length > 1001) return fail("单次最多导入 1000 行，请拆分 CSV 后再上传");

  const headers = rows[0].map((header) => header.trim());
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const [index, row] of rows.slice(1).entries()) {
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ""]));
    const name = pick(record, ["客户名称", "姓名/公司", "姓名", "公司", "name"]);
    const phone = pick(record, ["电话", "手机", "手机号", "phone"]);

    if (!name || !phone) {
      skipped += 1;
      errors.push(`第 ${index + 2} 行缺少客户名称或电话`);
      continue;
    }

    const exists = await prisma.crmCustomer.findFirst({ where: { dealerId, phone } });
    if (exists) {
      skipped += 1;
      continue;
    }

    const typeText = pick(record, ["客户类型", "类型", "customerType"]);
    const stageText = pick(record, ["阶段", "客户阶段", "stage"]);
    const intentText = pick(record, ["意向等级", "意向", "intentLevel"]);
    const tagsText = pick(record, ["标签", "tags"]);

    await prisma.crmCustomer.create({
      data: {
        dealerId,
        customerType: CUSTOMER_TYPE_MAP[typeText] ?? "INDIVIDUAL",
        name,
        phone,
        email: pick(record, ["邮箱", "email"]) || null,
        wechat: pick(record, ["微信", "wechat"]) || null,
        address: pick(record, ["地址", "address"]) || null,
        region: pick(record, ["地区", "区域", "region"]) || null,
        source: pick(record, ["来源", "source"]) || null,
        tags: tagsText.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean),
        stage: STAGE_MAP[stageText] ?? "LEAD",
        intentLevel: INTENT_MAP[intentText] ?? null,
        budget: parseAmount(pick(record, ["预算", "budget"])),
        demand: pick(record, ["需求描述", "需求", "demand"]) || null,
        nextFollowAt: parseDate(pick(record, ["下次跟进时间", "下次跟进", "nextFollowAt"])),
        remark: pick(record, ["备注", "remark"]) || null,
        ownerUserId: session!.user.id,
        createdBy: session!.user.name,
      },
    });
    created += 1;
  }

  return ok({ created, skipped, errors: errors.slice(0, 20) });
}

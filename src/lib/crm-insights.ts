type InsightCustomer = {
  stage: string;
  intentLevel: string | null;
  budget: number | null;
  demand: string | null;
  nextFollowAt: Date | string | null;
  lastContactAt: Date | string | null;
};

type InsightOpportunity = {
  stage: string;
  estimatedBudget: unknown;
  expectedCloseDate: Date | string | null;
};

type InsightTask = {
  status: string;
  dueAt: Date | string;
};

export type CrmInsight = {
  title: string;
  body: string;
  tone: "emerald" | "amber" | "rose" | "sky" | "slate";
};

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function buildCrmInsights(
  customer: InsightCustomer,
  opportunities: InsightOpportunity[],
  tasks: InsightTask[],
  now = new Date()
): CrmInsight[] {
  const insights: CrmInsight[] = [];
  const pendingTasks = tasks.filter((task) => task.status === "PENDING");
  const overdueTasks = pendingTasks.filter((task) => {
    const dueAt = toDate(task.dueAt);
    return dueAt ? dueAt < now : false;
  });
  const activeOpportunities = opportunities.filter((opportunity) => !["WON", "LOST"].includes(opportunity.stage));
  const proposalOrNegotiation = activeOpportunities.filter((opportunity) => ["PROPOSAL", "NEGOTIATION"].includes(opportunity.stage));
  const lastContactAt = toDate(customer.lastContactAt);
  const nextFollowAt = toDate(customer.nextFollowAt);
  const daysSinceContact = lastContactAt ? daysBetween(lastContactAt, now) : null;

  if (overdueTasks.length > 0) {
    insights.push({
      title: "先处理逾期待办",
      body: `当前有 ${overdueTasks.length} 个逾期待办，建议今天先完成跟进并记录客户反馈，避免高意向客户冷却。`,
      tone: "rose",
    });
  }

  if (customer.intentLevel === "HIGH" && activeOpportunities.length === 0 && customer.stage !== "DEAL") {
    insights.push({
      title: "高意向客户应尽快转商机",
      body: "客户已标记为高意向，但还没有进行中的商机。建议补建商机，明确项目名称、预算和预计成交日期。",
      tone: "amber",
    });
  }

  if (proposalOrNegotiation.length > 0) {
    insights.push({
      title: "推进报价反馈",
      body: "客户已有报价/谈判阶段商机，下一次沟通建议聚焦价格异议、交期、安装条件和决策人，争取把商机推进到赢单或明确输单原因。",
      tone: "sky",
    });
  }

  if (!lastContactAt && customer.stage !== "LEAD") {
    insights.push({
      title: "补一条历史跟进",
      body: "客户已不在线索阶段，但没有跟进记录。建议补录最近一次沟通内容，后续复盘成交路径会更清晰。",
      tone: "slate",
    });
  }

  if (daysSinceContact != null && daysSinceContact >= 7 && customer.stage !== "DEAL" && customer.stage !== "LOST") {
    insights.push({
      title: "客户已沉默一周以上",
      body: `距上次联系已 ${daysSinceContact} 天。建议用微信/电话确认需求是否变化，并设置下一次跟进时间。`,
      tone: "amber",
    });
  }

  if (!nextFollowAt && customer.stage !== "DEAL" && customer.stage !== "LOST") {
    insights.push({
      title: "缺少下一次跟进时间",
      body: "建议给客户设置明确的下次跟进时间，CRM 首页才能把它纳入每日待办池。",
      tone: "amber",
    });
  }

  const closeSoon = activeOpportunities.find((opportunity) => {
    const expectedCloseDate = toDate(opportunity.expectedCloseDate);
    if (!expectedCloseDate) return false;
    const days = daysBetween(now, expectedCloseDate);
    return days >= 0 && days <= 7;
  });
  if (closeSoon) {
    insights.push({
      title: "预计成交日在 7 天内",
      body: "建议提前确认方案、颜色、交付时间和付款条件，必要时把报价单/合同准备好，减少临门一脚的摩擦。",
      tone: "emerald",
    });
  }

  if (customer.stage === "DEAL") {
    insights.push({
      title: "成交客户可做复购经营",
      body: "建议记录安装/交付后的满意度、转介绍机会和补单需求，让成交客户继续沉淀为渠道资产。",
      tone: "emerald",
    });
  }

  if (customer.stage === "LOST") {
    insights.push({
      title: "流失客户建议保留原因",
      body: "建议在备注或跟进记录里写清流失原因，例如价格、交期、竞品、需求取消，后续才能做战败复盘。",
      tone: "slate",
    });
  }

  if (insights.length === 0) {
    insights.push({
      title: "当前客户状态健康",
      body: "资料、跟进和商机节奏暂时没有明显风险。建议继续按计划跟进，并在每次沟通后补充记录。",
      tone: "emerald",
    });
  }

  return insights.slice(0, 4);
}

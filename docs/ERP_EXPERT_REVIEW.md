# parti-b2b ERP 专家评审报告

- 日期：2026-10-04
- 评审方式：三路独立专家视角（订单履约与生产运营 / 财务与对账 / 架构与数据治理），逐文件读码，全部发现附代码证据
- 系统现状：Next.js 14 + Prisma + Supabase + Vercel（ptp.design）；126 张迁移历史订单（金额 0）、54 家直销客户（预付款制）、2 家经销商、1 个车间；真实账号已上线（2 ADMIN + 1 WORKSHOP），经销商门户已建未激活
- 结论速览：正常主链路（下单→派工→加工→发货→对账）已通且工程习惯良好（fail-closed cron、私有桶签名、审计日志、引用计数删除保护）；短板集中在**异常路径缺失**（取消/返工/退款）、**读接口越权**、**规模化假设**（单号竞态/无分页/缺索引）与**经营机制空白**（交期承诺、先款后产、毛利快照）

---

## 一、订单履约与生产运营专家（12 条，按业务价值排序）

| # | 发现 | 证据 | 定级 |
|---|---|---|---|
| F1 | **交期承诺零依据**：committedDeliveryDate 默认照抄客户要的日期；suggestedDeliveryDate 从不回写工单；全库无产能/负荷概念 | `api/work-orders/route.ts:63`、`api/orders/route.ts:237`、`api/orders/[orderNo]/review/route.ts:49` | 结构性（43% 逾期的机制性根因） |
| F2 | **Bug：外协直发绕过 PACKING，库存永不扣** | `api/work-orders/[workOrderNo]/status/route.ts:97-145` vs `lib/shipment.ts:69-72,110-114` | **P0 修复** |
| F3 | **订单取消/改单是死路**：CANCELLED/COMPLETED/PARTIALLY_PAID 三个状态无任何业务代码写入；行级仅 includedInProfit 可编辑 | 全库 grep；`api/orders/[orderNo]/submit/route.ts:13`、`lines/[lineId]/route.ts:8-9` | P1 |
| F4 | **缺料校验在 PACKING（加工完成后）才发生**，派单/开工不校验 | `status/route.ts:49-59,174-213` | P1 |
| F5 | **无 MRP**：PO 行无需求来源字段，defaultLeadTimeDays 从不参与计算 | `schema.prisma:542-555`、`:488-489` | P1（需求汇总页快赢） |
| F6 | **状态机无返工/暂停/报废出口**：QC 只能→PACKING；无 ON_HOLD/CANCELLED | `lib/workorder.ts:24-32` | P1/P2 |
| F7 | QC 只是布尔不是记录；内部单 qcRequired 写死 false | `api/orders/route.ts:239` | P2 |
| F8 | 发货缺签收环节；客户看不到多张运单；PARTIALLY_SHIPPED 下无从核对剩余 | `schema.prisma:438-456`、`dealer/orders/[orderNo]/page.tsx:96` | P1/P2 |
| F9 | 飞书 digest 覆盖窄（仅交期≤3天 在产 30 条）、每日一次、无升级机制 | `vercel.json:8-10`、`api/cron/feishu-digest/route.ts:24-32` | P1 |
| F10 | 报价粒度撑不住真实成本：加工费一口价 3 元/支不分工序、米重全局 0.65、毛利仅行级 | `lib/pricing.ts:50-87,2` | P1/P2 |
| F11 | 型材消耗是理论下限：无锯缝、无余料（offcut）实体，yieldRate 0.95 一刀切 | `status/route.ts:130-135`、`lib/cutlist.ts:43` | P2 |
| F12 | 外协无对账闭环：工单无 supplierId，发出/回厂无数量登记，加工费不进成本 | `schema.prisma:179-201`、`shipment-form.tsx:161` | P2 |

**只做三件事**：① 交期承诺机制（队列+历史 P50/P90，承诺≥建议值）② 扣料/缺料前移到派单开工+修外协直发 bug ③ 补齐取消/返工/报废异常路径。

## 二、财务与对账专家（10 条，按风险×价值排序）

| # | 发现 | 证据 | 定级 |
|---|---|---|---|
| C1 | **应收口径漏掉 PARTIALLY_SHIPPED**，部分发货订单从应收消失、收款核销错配 | `lib/shipment.ts:124` vs `lib/reconcile.ts:6-13`；`api/dealer-payments/route.ts:65-71` | **P0 修复** |
| C2 | **预付款制无"先款后产"强制**：信用检查只对 CREDIT 生效，内部单完全绕过，发货/派单无付款门槛 | `api/orders/route.ts:162-165`、`review/route.ts:37-39`、`shipment.ts:48` | P1 |
| C3 | 收款只有客户级 FIFO 自动核销，无指定订单核销、无退款模型（amount 拒绝负数） | `api/dealer-payments/route.ts:64-92`、`panel.tsx:18-19` | P1 |
| C4 | 收款无凭证附件、无流水导入、无银行/微信对碰 | `schema.prisma:621-637` | P2 |
| C5 | 收款/付款 POST 不进审计日志（删除反而进）；settings 审计无 before/after | grep logAudit 10 处调用点 | **P0 补审计**（并入安全批） |
| C6 | 销售订单无作废/取消 API，错误单据无法红冲（采购单反而有） | `api/orders/[orderNo]/route.ts` 仅 GET | P1 |
| C7 | **应收两套口径**：对账用 totalAmount、核销用 confirmedAmount ?? totalAmount | `lib/reconcile.ts:43,76` vs `dealer-payments/route.ts:75,88` | **P0 修复** |
| C8 | **成本页漏 cutLengthMm**（PROFILE 行成本=0 毛利虚高）；毛利非快照随配置漂移；confirmedPrice 定义未用 | `admin/orders/[orderNo]/page.tsx:47-56,52`、`api/orders/route.ts:128-130` | **P0 修复口径** + P2 快照 |
| C9 | 126 张迁移 0 元单混入应收与趋势图（趋势 SQL 无状态过滤） | `scripts/migrate-feishu-base.ts:251`、`admin/page.tsx:57-65` | P1 |
| C10 | 税票仅静态字段：无开票申请/状态/税额分离；无客户对账单打印 | `print/quote/[orderNo]/page.tsx:125` | P1（对账单打印）/P2（开票） |

**敢不敢用来收钱管账**：敢"记"不敢"管"。最小可信路径 = C1、C2、C5、C6 → 再做 C3、C4。

## 三、架构与数据治理专家（12 条，按严重度排序）

| # | 发现 | 证据 | 定级 |
|---|---|---|---|
| A1 | **越权/跨租户读**：shipments GET（DEALER 可拉全量含客户地址）、suppliers GET（无角色限制含银行账号）、orders/[orderNo] GET（WORKSHOP 拿 dealer 全量 PII）、stock-counts GET（DEALER 可看全部盘点）、products GET（全角色见 purchasePrice 成本价）、pricing/calculate（WORKSHOP 见成本结构） | 各 route 逐行 | **P0 修复** |
| A2 | **单号竞态**：五个单号函数 Math.random，displayOrderNo 无锁无重试，日 100 单撞号率≈39% | `lib/utils.ts:26-60,216-223`、`lib/order-no.ts:11-17` | **P0 修复** |
| A3 | 多车间结构性约束：WorkOrder.orderNo @unique = 一单一工单，拆单/二车间/外协一等产能都要动 schema | `schema.prisma:182,198`、`api/work-orders/route.ts:48-49`、`lib/shipment.ts:63-65` | P2 设计先行 |
| A4 | 列表页无分页、驾驶舱全表进内存（reconcile 全量拉 JS 算） | `admin/orders/page.tsx:13-18`、`lib/reconcile.ts:31-58` | P2（1 万单前） |
| A5 | **索引缺失**：SalesOrderLine(orderNo)、SalesOrder(dealerId/orderDate/orderStatus)、PurchaseOrderLine(poNo) | `schema.prisma:312-355,386-420,542-555` | **P0 修复** |
| A6 | 备份无恢复脚本、无演练、对象无限累积、cron 60s 超时风险 | `api/cron/daily-backup/route.ts:54-81`、`lib/backups.ts:5` | P2 |
| A7 | 零错误监控/告警（无 Sentry，feishu 失败静默，cron 停转无人知） | `package.json`、`lib/feishu.ts:13` | P1/P2 |
| A8 | 60+ route 手写鉴权无集中守卫，标准已漂移（files 只查登录不查归属 vs stamp 查前缀） | `api/files/route.ts:12-23` | **P0（files 归属）**+P1 守卫 |
| A9 | 主数据治理：dealerNo/sku 自由输入，规范只在 placeholder；码表可物理删改写历史渲染 | `api/dealers/route.ts:35`、`lib/settings.ts` | P1/P2 |
| A10 | 无软删；User 无 status 无法停用；needsReview 零消费（悬单无清理路径） | `schema.prisma:138-158` | P1 |
| A11 | PWA 只有壳：manifest 仅 1 SVG、无 192/512 PNG、start_url=/workshop 对 admin/dealer 错误；activate 无限流 | `public/manifest.webmanifest` | **P0（图标/URL）**+P2 |
| A12 | Prisma 未声明 pgbouncer 参数（serverless 连接风暴/prepared statement 报错风险）；README 路由过期 | `lib/prisma.ts:5-9`、`.env.example`、`README.md` | **P0（注释/文档）** |

**上线 3 个月技术债清单**：M1 止血（A1/A2/A5/A7/A12）→ M2 规模化（A4/A6/A10/A9 快赢）→ M3 结构预研（A3 WorkOrderLine 设计、PWA 离线、role 矩阵测试）。

---

## 四、优化路线图

### P0 正确性与安全批（2026-10-04 已完成上线）
1. 外协直发补扣库存（F2）　2. PARTIALLY_SHIPPED 入应收（C1）　3. 应收口径统一 confirmedAmount ?? totalAmount（C7）　4. 成本页 cutLengthMm ?? lengthMm（C8）　5. 六处越权读收紧 + files 归属（A1/A8）　6. 单号 P2002 重试（A2）　7. 四个索引 migration（A5）　8. pgbouncer 注释+README 修正+manifest 图标/start_url（A11/A12）　9. 收付款 POST 补审计（C5）　10. User 停用/启用/删除（A10，含最后管理员守卫与留痕保护）

### P1 经营机制批（2026-10-04 二轮专家复盘后已完成上线）
- **数据校准**（生产库 124 单实测）：实际逾期 **89.2%**（43% 假说被证伪——客户要求 P50=1d vs 产能 P50=4d/P90=16d，24.6% 的单要求日期早于下单日）；RAW-P2525 占 98% 无需分 SKU
- **交期承诺**（F1+F9）：`lib/delivery-insight`（队列负荷 + SKU 周期 P50/P90 分位 SQL + 建议公式 max(客户日期, 今天+P90)，队列紧上浮 P95）；派单面板展示建议值与依据，早于建议必填提前原因（双端校验，`WorkOrder.committedOverrideReason`）；**内部代下单自动派单同样校准**——急单承诺自动上调并 toast 告知（10/5→10/31 实测）；digest 升级四段式（超期/5 天到期/待审核>24h/低库存）
- **缺料前移**（F4）：`getMaterialShortages` 共享；派单与开工默认拒绝、force 放行留痕；车间开工按钮带强制入口；PACKING 最后防线保留
- **原料需求汇总页**（F5 mini-MRP）：在制工单用料 vs 库存 vs 在途 PO，净缺口勾选一键 PO 草稿
- **订单取消/结案**（F3+C6）：WorkOrderStatus+CANCELLED；取消守卫矩阵（部分发货/已打包需 force、已收款 warning 不阻塞、CREDIT 释放、悬单了结）；SHIPPED→COMPLETED 结案；combo/标签/工单详情联动
- **先款后产**（C2）：`Dealer.enforcePrepay` 客户维度开关，派单/发货拦截（外协直发同拦），内部单 D2 豁免
- **收款指定核销**（C3）：可选 allocations 指定订单优先、剩余 FIFO；超额/跨客户拒绝；删除回滚兼容
- **报表口径**（C9）：驾驶舱趋势/状态分布排除迁移单与废态；对账明细过滤 0 元单
- **客户对账单打印**（C10）：/print/statement/[dealerId]，含收款核销明细、大写金额、签收栏；负余额显示"预收"

### P2 规模化与结构性（3 个月窗口，待点单）
列表分页+驾驶舱 SQL 聚合（A4）｜备份恢复演练+lifecycle（A6）｜Sentry+告警（A7）｜集中鉴权守卫 requireRole（A8）｜dealerNo/SKU 自动生成（A9）｜WorkOrderLine 行级分派设计评审（A3，二车间前必做）｜外协对账闭环（F12）｜QC 记录化（F7）｜签收环节（F8）｜开票状态（C10）｜流水导入对碰（C4）｜毛利快照（C8）｜余料实体（F11）｜报价分工序计价（F10）｜PWA 离线（A11）｜码表停用制（A9）

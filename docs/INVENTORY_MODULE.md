# 库存模块完整化（2026-10-05 上线）

九项能力一次补齐，目标：账实闭环、库存可见、计划有据。

## 一、余段回库（账实闭环的根）
- 位置：工单详情页「余料回库」卡（车间端/管理员端同一组件）
- 口径：理论余量 = 扣棒数×棒长 − 切长合计（面板自动算并展示）；段长 ≥300mm 建议回库
- 行为：录入 源原料 SKU + 段长 + 根数 → 自动建/复用 `SEMI-{系列}-{段长}-{表面}-{颜色}` 档案并入库（PRODUCTION_RETURN 流水，每米成本随行）；上限 = 理论余量+5% 锯口宽放，防误录放大库存
- 前提：工单已领料（PROCESSING 之后；未领料 UI 禁用 + API 409）

## 二、库存调拨（总部仓 ↔ 车间仓）
- 位置：管理端「库存调拨」页；一笔调拨 = 出库+入库两条流水（TRANSFER_OUT/IN），数量移动、每米成本随行并按米数加权融合到目标仓均价
- 单号 TR-YYMMDD-NNN；调出仓库存不足直接 409

## 三、库存估值 + 收发存（库存管理页）
- 估值：型材 每米移动均价×米数，五金 档案采购价；按仓小计 + 总额
- 收发存：按自然月（可切近 4 个月）期初/采购/回库/调拨入/盘调/领料/调拨出/期末

## 四、占用与可用量
- 可用量 = 全网现存 − 未结工单占用（未发货未取消且未扣料的工单需求，与扣料同口径聚合）
- 下单接口返回 materialWarning（非阻断 toast）；原料需求页展示 现存/占用/可用

## 五、动态补货建议
- 补货点 = 近 30 天日均消耗 ×（供应商默认交期 + 3 天安全）；建议采购 = 补货点 − 可用量
- 交期取该 SKU 最近采购单供应商的 defaultLeadTimeDays，无记录按 7 天

## 六、收货炉批号
- 收货表单可填炉批号 → 写入 PO_RECEIPT 流水（batchNo 字段），供同色防色差追溯

## 七、呆滞分析
- 库存管理页「呆滞清单」：现存>0 且 ≥90 天无流水，显示闲置天数与最后动账时间

## 八、外协在途物料账
- 原料需求页「外协在途物料」卡：工单状态=外协中 的用料占用按外协单位/工单列出

## 九、ABC 分类与盘点计划
- 盘点审核页新卡：近 90 天消耗价值 ABC（A≤70%/B≤90%/C 余量），周期 A 月盘/B 季盘/C 半年盘
- 下次应盘日 = 上次盘点批准日 + 周期（从未盘过的立即应盘），过期标红

## 技术要点
- 迁移 `20261005c_inventory_module`：StockMovementType += TRANSFER_OUT/TRANSFER_IN/PRODUCTION_RETURN；StockMovement.batchNo；TransferOrder/TransferLine 模型（双库已应用）
- 核心库 `src/lib/inventory-analytics.ts`：getAllocations/getAvailability/getValuation/getPeriodSummary/getReorderSuggestions/getAging/getAbcClassification
- API：POST/GET /api/transfers；GET/POST /api/work-orders/[no]/material-return；receive +batchNo；orders +materialWarning
- smoke Phase K：14 断言（调拨数量/均价随行、余段成 SEMI、估值 730 元数学、收发存 0/14/5/9、占用 2 根、补货、ABC 单调、库龄），全套 96 断言

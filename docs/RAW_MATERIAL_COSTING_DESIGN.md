# 原料批次计价 × 表面化 × 米重模型：全局关联统合评审

> 2026-10-04 · 四路产品经理并行只读评审（供应链库存 / 生产报价 / 财务对账 / 数据治理）后的统合结论。
> 业务前提（老板确认）：原料 = 铝挤压+表面处理完成的长管，**按重量批次采购、批批价格不同**；加工 = 截断→铣孔→预埋（同工单连续，中间不入仓）；成本 = 每米价×切长÷良率；米重 kg/m 是截面常数。

## 一、根因一句话

**报价与成本用的是全局常数（米重 0.65 / 素材价 28 元/kg / 利用率 0.92，`src/lib/pricing.ts:1-14`），与 Product 完全脱钩；而库存链路零成本字段、全链以「根」为唯一单位。** 批次计价要落的不是某一行代码，而是「成本按米、实物按根、价格按批次」三层口径的分离——四路评审在根因上完全收敛。

## 二、统合发现（跨域共识 + 冲突裁决）

### 共识（≥2 路 PM 独立得出）

| # | 发现 | 证据 | 共识方 |
|---|---|---|---|
| 1 | 报价引擎全局常数与 SKU 脱钩，P2525/P5050 同米重计价失真 | `pricing.ts:1-14`、`settings.ts:52-63` | 供应链/报价/财务/治理 |
| 2 | SalesOrderLine 无成本快照，利润页用"今天的参数"重算历史订单 | `admin/orders/[orderNo]/page.tsx:71-97` | 报价/财务/治理 |
| 3 | 良率双常数：报价 utilization=0.92 vs 扣料 Product.yieldRate=0.95 | `pricing.ts:3`、`stock-consume.ts:52` | 供应链/报价/治理 |
| 4 | 棒长 `?? 3600` 魔法默认，漏填则扣料/缺料/需求齐降 ~40% | `stock-consume.ts:51,93`、`manager.tsx:103` | 供应链/治理 |
| 5 | 均价应挂 `WorkshopInventory`（分车间），不挂 Product | `inventory.ts:27-52` 单漏斗是架构红利 | 供应链/报价/治理 |
| 6 | 库存单位保持「根」，成本切米口径，两者解耦不互改 | `schema.prisma:585` 全 Int | 供应链/报价 |
| 7 | 原料 SKU 拆分必须「实物盘点→建新→成对流水切换→旧 SKU 停用」，程序不能按比例拆存量；历史订单行 rawProductId 不改写 | `schema.prisma:413`（裸字符串）、`:591`（sku join key） | 供应链/报价/治理 |
| 8 | surfaceTreatment 一列三态（Base 原文/A-SV 码/自由文本），读端 4 处只读旧串，cutlist 已只认双码 | `workorder-loader.ts:54`、`cutlist.ts:39-43` 等 | 报价/治理 |
| 9 | PO 链路进不去"按重量/总价"：行只有 quantity×unitPrice，收货只收整数根 | `api/purchase-orders/route.ts:56`、`receive/route.ts:11` | 供应链/财务/治理 |
| 10 | 扣料幂等聚合按 rawProductId，SKU 表面化后扣料代码零改动即自动分桶——改造焦点在下单绑定，不在扣料 | `stock-consume.ts:32-37` | 供应链/报价/治理 |

### 冲突裁决（统合综效的增值点）

- **qtyMeters 独立主账？** 治理组建议加；供应链/报价组反对。**裁决：不加**——棒长上 Product 后，账面米数 = 根数×棒长 派生即可，收货事件自记本批米数用于加权，避免双账对不齐。定尺差异（不同供应商）真实出现时再议。
- **PurchaseLot 批次实体？** 治理组建议建表；其余三路认为 MVP 不需要。**裁决：暂缓**——`StockMovement.unitCost` 快照列已同时满足移动加权与审计回溯；等「一行 PO 分多次到货、重量各异」成为真实痛点再建实体。
- **毛利快照 vs 均价先后？** 财务组要求快照先行；治理组指出先落 weightPerMeter 否则快照固化错误常数。**裁决：三者同批交付**（见依赖链）。

### 顺手发现的可独立修复项（不依赖批次模型）

1. 复制历史单 `surfaceTreatment.split("-")` 对 Base 原文（"Pink粉色-水漆"）产出垃圾色码 — `admin/orders/new/page.tsx:215-216`
2. 良率双常数统一读 Product.yieldRate — `pricing.ts`
3. 棒长必填校验，消灭 3600 默认 — `stock-consume.ts:51,93`、产品表单
4. 需求汇总页跨车间求和 vs 缺料检查单车间，口径不一致会漏报缺口 — `material-demand/page.tsx:44-47`
5. 改价审计只记 key 不记 old/new — `api/settings/route.ts:43-50`
6. 报价成本页把 28 元/kg 等参数硬编码进 label 文案 — `admin/pricing/page.tsx:87-93`

### 确认的好消息（不用动）

- **预收/应收/核销与成本完全解耦**（`dealer-payments/route.ts`、`payment-guard.ts`、`print/statement` 只看收入侧字段）——批次成本改造不碰收款对账。
- 派单/开工/打包/外协直发/自动派单五处缺料检查共用 `stock-consume.ts` 单漏斗，改口径一处生效。
- 门户与代下单报价走同一 `/api/pricing/calculate`，引擎改一次两端受益。

## 三、依赖排序链（顺序不能乱）

```
weightPerMeter 落 Product ──→ 成本快照才值得写（否则固化错误常数）
成本快照 ──→ 移动加权均价才能上线（否则每收一批货重写历史毛利）
均价 ──→ 余料实体估值、毛利报表（P2 两项的前置）
原料 SKU 表面化 ──→ 必须同批交付「下单表面绑定校验」（否则黑色单挂银色桶扣错库存）
```

P2 既定项重排：**毛利快照从 P2 提前并入本路线**；余料实体估值口径直接复用 avgCostPerMeter；WorkOrderLine 形态不受影响，仅在批次模型定稿后预留行级成本快照与 WOL 幂等键。

## 四、统合路线（四步，每步可独立上线/回滚）

**第 0 步 · 数据铺底（纯 additive，零行为变化）——✅ 2026-10-05 已上线（main `e1e867f`）**
- ✅ `Product.weightPerMeter`（回填自全局设置 0.65，待按系列改真实值）+ 棒长必填（API+前端拦截）
- ✅ `WorkshopInventory.avgCostPerMeter`；`StockMovement.unitCost`（快照）；`SalesOrderLine.costSnapshot`（nullable，读端未消费）
- ✅ 6 个独立修复项全部落地（复制单垃圾色码防护/折棒公式去重 barsFor/审计 old→new×2/报价页文案动态化/需求页分车间+按车间分组生成 PO）
- ✅ 追加：**半成品段原料支持**（用户改判"不做清单"——总部仓确实存半成品段）：`Product.materialStage` RAW/SEMI，半成品段可建档、入库存（盘点/手工调整）、被订单行直接消耗（截断后段长=棒长、良率≈1）；RAW→SEMI 生产转化流留给 WorkOrderLine 阶段
- ✅ 追加：**SKU 自动生成**（P2 提前）：目录留空即编码 `RAW-{系列}-{表面}-{颜色}` / `SEMI-{系列}-{段长}-{表面}-{颜色}` / `P-{系列}` / `HW-{年月}-{序号}`，冲突避让 -2，手工优先

**第 1 步 · 口径切换（公式单一真相）——✅ 2026-10-05 已上线（main `6d3cdbb`）**
- ✅ `calcPricing` 支持 SKU 级基数：材料成本 = 切长 ÷ Product.yieldRate × 每米价，表面费不单列（原料已含表面处理）；无基数时回退全局常数旧公式（表面单列），向后兼容
- ✅ `resolveRawBasis` 三级回退（`src/lib/pricing-source.ts`）：车间 avgCostPerMeter 取高者（AVG）→ purchasePrice÷棒长（PURCHASE，手工维护最近批次）→ 全局常数（SETTINGS）
- ✅ 良率单源：Product.yieldRate 优先，全局 utilization 降级为缺省回退
- ✅ 报价 API / 代下单 / 门户工作台三端均传 rawProductId，同一引擎
- ✅ 下单服务端写 costSnapshot（source/每米价/米重/良率/单支成本/切长/时点）；利润页快照优先（「下单锁定」徽标 + 每米价来源/每米价/米重/良率/切长五项明细），历史行无快照回退「实时估算」——历史毛利不再随参数/批次价漂移
- ✅ smoke 新增 Phase H 9 断言（口径数学/三级回退/快照往返），共 62；线上实测：RAW-P2525（48 元/3.6m）→ PURCHASE 层每米价 13.33、单支成本 27.04、快照落库往返一致

**第 2 步 · 批次收货 + 移动加权自动滚**
- PO 行支持「总重+总价」或「根数×定尺」；收货双录入（根数+磅重）
- 收货事务：批次每米价 → 更新车间均价 → StockMovement 记 unitCost
- 磅差容忍带（±0.5% 自动、超差人工）；应付口径 = 磅重×结算单价；均价重算审计 old→new

**第 3 步 · 原料 SKU 表面化迁移**
- 实物盘点 → 建 `RAW-系列-表面-颜色` 新 SKU → 库存成对流水切换 → 旧 SKU 停用（不删）
- 下单表面双下拉变**派生只读** + 后端一致性校验；OrderCombo 重映射；复制历史单重映射
- surfaceTreatment 收敛：backfill 双码、读端 4 处切双码、写端停止合成旧串

## 五、明确不做（统合后的"不做清单"；半成品已于 2026-10-05 经用户改判移出）

~~半成品目录级~~（**已改判：总部仓存半成品段，materialStage=SEMI 已上线**）｜余料回仓/切余料管理（先记账观察）｜PurchaseLot 实体（StockMovement.unitCost 够用）｜库存数量 Decimal 米化（根/米双口径文档化即可）｜会计级 COGS 月末结转｜废料回收抵扣｜分工序计价费率表（等工时单价，引擎签名预留）｜铝价行情接口

---
*四路原始分析全文见会话记录；本文件为统合结论，供实施与复核。*

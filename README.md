# Parti B2B ERP — 模块一

报价计算器 + 销售订单管理

## 技术栈
Next.js 14 · TypeScript · Prisma · Supabase PostgreSQL · NextAuth v5 · Tailwind · shadcn/ui

## 本地运行

```bash
npm install
cp .env.example .env    # 填入 DATABASE_URL / DIRECT_URL / NEXTAUTH_SECRET
npx prisma db push
npm run db:seed         # 仅限本地开发；生产环境拒绝执行（见下）
npm run dev
```

> **演示数据安全策略**：`db:seed` / `seed-workshop` 仅创建本地演示账号（admin@parti.com / admin123 等），
> `NODE_ENV=production` 下直接拒绝执行，防止演示弱口令进入生产。
> **生产初始化**：使用 `npm run init:prod`（管理员邮箱与初始密码从环境变量读取，密码 ≥10 位，创建后强制改密）。

## 部署
已配置 Vercel 自动部署。推送到 main 即触发。生产环境变量在 Vercel Dashboard 配置（.env 已 gitignore，勿提交）。

## 模块
- `/login` 登录
- `/dealer` 经销商工作台（报价/目录/订单）
- `/admin` 运营后台（驾驶舱/代下单/客户/发货/对账）
- `/api/pricing/*`, `/api/orders/*`, `/api/dealers/*`

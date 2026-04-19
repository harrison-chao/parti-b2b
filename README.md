# Parti B2B ERP — 模块一

报价计算器 + 销售订单管理

## 技术栈
Next.js 14 · TypeScript · Prisma · Supabase PostgreSQL · NextAuth v5 · Tailwind · shadcn/ui

## 本地运行

```bash
npm install
cp .env.example .env    # 填入 DATABASE_URL / DIRECT_URL / NEXTAUTH_SECRET
npx prisma db push
npm run db:seed
npm run dev
```

## 测试账号

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 管理员 | admin@parti.com | admin123 |
| 运营 | ops@parti.com | ops123 |
| 经销商 | dealer@parti.com | dealer123 |

## 部署
已配置 Vercel 自动部署。推送到 main 即触发。

## 模块
- `/login` 登录
- `/dealer` 经销商工作台（报价/目录/订单）
- `/ops` 运营后台（驾驶舱/审核/经销商）
- `/api/pricing/*`, `/api/orders/*`, `/api/dealers/*`

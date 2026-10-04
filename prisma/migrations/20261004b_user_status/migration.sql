-- 账号生命周期（评审 A10）：停用可登录拦截；无业务记录可硬删
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "User" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

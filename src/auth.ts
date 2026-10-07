import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@prisma/client";
import { authConfig } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      dealerId?: string | null;
      workshopId?: string | null;
      mustChangePassword?: boolean;
    };
  }
  interface User {
    id?: string;
    role?: UserRole;
    dealerId?: string | null;
    workshopId?: string | null;
    mustChangePassword?: boolean;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Node 端会话逐请求回查（middleware 的 Edge 拷贝不带这段）：停用/重置密码/角色变动即时生效，
    // 修复纯 JWT claims 冻结 30 天导致的"停用账号仍可操作"缺口
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
        (token as any).dealerId = (user as any).dealerId ?? null;
        (token as any).workshopId = (user as any).workshopId ?? null;
        (token as any).mustChangePassword = (user as any).mustChangePassword ?? false;
        return token;
      }
      if ((token as any).id) {
        const fresh = await prisma.user.findUnique({
          where: { id: (token as any).id as string },
          select: { status: true, role: true, dealerId: true, workshopId: true, mustChangePassword: true },
        });
        if (!fresh || fresh.status !== "ACTIVE") {
          (token as any).role = "REVOKED";
          return token;
        }
        (token as any).role = fresh.role;
        (token as any).dealerId = fresh.dealerId ?? null;
        (token as any).workshopId = fresh.workshopId ?? null;
        (token as any).mustChangePassword = fresh.mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        if ((token as any).role === "REVOKED") throw new Error("账号已停用");
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
        (session.user as any).dealerId = (token as any).dealerId ?? null;
        (session.user as any).workshopId = (token as any).workshopId ?? null;
        (session.user as any).mustChangePassword = (token as any).mustChangePassword ?? false;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim();
        const pwd = String(creds?.password ?? "");
        if (!email || !pwd) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.status === "INACTIVE") return null; // 停用账号拒绝登录
        const ok = await bcrypt.compare(pwd, user.password);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          dealerId: user.dealerId,
          workshopId: user.workshopId,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});

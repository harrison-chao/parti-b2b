import type { NextAuthConfig } from "next-auth";

// 会话时效：JWT 默认 30 天；配合下方逐请求回查，停用/重置密码即时生效（吊销语义）
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).role = (user as any).role;
        (token as any).dealerId = (user as any).dealerId ?? null;
        (token as any).workshopId = (user as any).workshopId ?? null;
        (token as any).mustChangePassword = (user as any).mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = (token as any).id;
        (session.user as any).role = (token as any).role;
        (session.user as any).dealerId = (token as any).dealerId ?? null;
        (session.user as any).workshopId = (token as any).workshopId ?? null;
        (session.user as any).mustChangePassword = (token as any).mustChangePassword ?? false;
      }
      return session;
    },
  },
};

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;
  const role = (req.auth?.user as any)?.role;
  const mustChangePassword = Boolean((req.auth?.user as any)?.mustChangePassword);

  const publicPaths = ["/login", "/activate", "/api/auth", "/api/activate", "/api/cron"];
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!isAuthed) return NextResponse.redirect(new URL("/login", req.url));
  if (mustChangePassword && pathname !== "/account/force-password" && !pathname.startsWith("/api/account/force-password")) {
    return NextResponse.redirect(new URL("/account/force-password", req.url));
  }

  const home = role === "ADMIN" ? "/admin" : role === "WORKSHOP" ? "/workshop" : "/dealer";

  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL(home, req.url));
  }
  if (pathname.startsWith("/dealer") && role !== "DEALER") {
    return NextResponse.redirect(new URL(home, req.url));
  }
  if (pathname.startsWith("/workshop") && role !== "WORKSHOP") {
    return NextResponse.redirect(new URL(home, req.url));
  }
  if (pathname === "/") {
    return NextResponse.redirect(new URL(home, req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

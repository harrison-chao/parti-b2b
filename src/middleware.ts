import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthed = !!req.auth;
  const role = (req.auth?.user as any)?.role;

  const publicPaths = ["/login", "/api/auth"];
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!isAuthed) return NextResponse.redirect(new URL("/login", req.url));

  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dealer", req.url));
  }
  if (pathname.startsWith("/dealer") && role !== "DEALER") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  if (pathname === "/") {
    return NextResponse.redirect(new URL(role === "DEALER" ? "/dealer" : "/admin", req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};

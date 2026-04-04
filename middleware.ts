import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const operatorAllowedAdminPaths = ["/admin/stock", "/admin/stock-movements"];

  // Always allow auth endpoints to avoid auth-loop failures.
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Try secure cookie name first (production HTTPS), then non-secure (fallback).
  let token = await getToken({ req, secret, secureCookie: true });
  if (!token) {
    token = await getToken({ req, secret, secureCookie: false });
  }

  // Public login page
  if (pathname === "/login") {
    if (token) {
      const role = token.role;
      if (role === "ADMIN") return NextResponse.redirect(new URL("/admin", req.url));
      if (role === "OPERATOR") return NextResponse.redirect(new URL("/operator", req.url));
      if (role === "DRIVER") return NextResponse.redirect(new URL("/driver", req.url));
    }
    return NextResponse.next();
  }

  // Not logged in → login page
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = token.role;

  // Root redirect based on role
  if (pathname === "/") {
    if (role === "ADMIN") return NextResponse.redirect(new URL("/admin", req.url));
    if (role === "OPERATOR") return NextResponse.redirect(new URL("/operator", req.url));
    if (role === "DRIVER") return NextResponse.redirect(new URL("/driver", req.url));
  }

  // Role-based access control
  if (pathname.startsWith("/admin") && role !== "ADMIN") {
    const isOperatorAllowedAdminPath = role === "OPERATOR"
      && operatorAllowedAdminPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

    if (isOperatorAllowedAdminPath) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  if (pathname.startsWith("/operator") && role !== "ADMIN" && role !== "OPERATOR") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  if (pathname.startsWith("/driver") && role !== "ADMIN" && role !== "DRIVER") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)"],
};

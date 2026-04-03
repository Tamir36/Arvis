import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const operatorAllowedAdminPaths = ["/admin/stock", "/admin/stock-movements"];

  // Allow public paths
  const publicPaths = ["/login", "/api/auth"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    // Redirect logged-in users away from login page
    if (session && pathname === "/login") {
      const role = session.user?.role;
      if (role === "ADMIN") return NextResponse.redirect(new URL("/admin", req.url));
      if (role === "OPERATOR") return NextResponse.redirect(new URL("/operator", req.url));
      if (role === "DRIVER") return NextResponse.redirect(new URL("/driver", req.url));
    }
    return NextResponse.next();
  }

  // Not logged in → login page
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = session.user?.role;

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
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)"],
};

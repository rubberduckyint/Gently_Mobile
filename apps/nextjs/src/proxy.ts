import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export default function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  // IF user not authenticated AND
  // The current route is not the login route
  // Redirect the user to the login page
  if (!sessionCookie && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (!url.searchParams.has("redirectUrl")) {
      url.searchParams.set("redirectUrl", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(url);
  }

  // IF user is authenticated AND navigates to the root path, redirect them to dashboard
  // IF user is authenticated AND navigates to the login page, redirect to dashboard
  if (pathname === "/" || (sessionCookie && pathname.startsWith("/login"))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

// Define the routes that should be handled by this middleware
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/devices/:path*",
    "/alarms/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/login",
    "/",
  ],
};

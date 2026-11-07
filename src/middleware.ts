import { NextResponse, type NextRequest } from "next/server";

// Cheap edge gate: requests without a session cookie are sent to /login.
// Real session validation happens server-side in getCurrentUser().
const PUBLIC = [/^\/login/, /^\/setup/, /^\/portal\//, /^\/p(\/|$)/, /^\/book/, /^\/api\/public\//, /^\/api\/portal\//, /^\/api\/cron\//, /^\/_next\//, /^\/favicon/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  if (!req.cookies.get("noise_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };

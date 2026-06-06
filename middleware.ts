import { NextRequest, NextResponse } from "next/server";

/**
 * Site-wide HTTP Basic Auth.
 *
 * The browser shows its native username/password dialog the first time someone
 * hits the site. Successful auth is cached by the browser for the rest of the
 * session, so it's a one-time prompt per session.
 *
 * Defaults are baked in so the site is protected even before env vars are set
 * in Vercel. Override on Vercel by setting BASIC_AUTH_USER and BASIC_AUTH_PASSWORD.
 *
 * /api/cron/* is exempt so the Vercel cron job can hit /api/cron/refresh
 * with its own `Authorization: Bearer ${CRON_SECRET}` header.
 */
const USER = process.env.BASIC_AUTH_USER || "kyozo-dev";
const PASSWORD = process.env.BASIC_AUTH_PASSWORD || "buildsomethingpeoplewant";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="dev_dashboard", charset="UTF-8"',
    },
  });
}

export function middleware(req: NextRequest) {
  // Let Vercel cron through (it carries its own bearer token).
  if (req.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) {
    return unauthorized();
  }
  // header = "Basic <base64(user:password)>"
  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return unauthorized();
  }
  const sep = decoded.indexOf(":");
  if (sep < 0) return unauthorized();
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  if (user !== USER || pass !== PASSWORD) {
    return unauthorized();
  }
  return NextResponse.next();
}

export const config = {
  // Match everything except Next.js internals.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};

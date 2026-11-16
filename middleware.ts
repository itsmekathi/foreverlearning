export { auth as middleware } from "@/auth";

export const config = {
  // Everything except auth endpoints, the login page, cron, and static/PWA assets.
  matcher: [
    "/((?!api/auth|api/cron|login|_next/static|_next/image|pdfjs|icons|manifest.webmanifest|icon.svg|favicon.ico).*)",
  ],
};

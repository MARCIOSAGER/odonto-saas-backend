import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname.startsWith("/dashboard")) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      const url = new URL("/login", req.url)
      return NextResponse.redirect(url)
    }
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*"]
}

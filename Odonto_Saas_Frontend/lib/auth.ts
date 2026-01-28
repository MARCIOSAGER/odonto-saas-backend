import type { NextAuthOptions } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { api } from "@/lib/api"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login"
  },
  providers: [
    Credentials({
      name: "Credenciais",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        try {
          const res = await api.post("/api/auth/login", {
            email: credentials.email,
            password: credentials.password
          })
          const user = res.data?.user || { email: credentials.email }
          const token = res.data?.token
          if (!token) return null
          return { ...user, accessToken: token }
        } catch (e) {
          return null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && (user as any).accessToken) {
        token.accessToken = (user as any).accessToken
      }
      return token
    },
    async session({ session, token }) {
      ;(session as any).accessToken = (token as any).accessToken
      return session
    }
  }
}

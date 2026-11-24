import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import { isLocked, nextLockState, verifySecret } from "./secret"
import { normalizeMobile } from "./validation"

// Auth for the housekeeping module only. The rest of the OS has no login yet.
//  - "hk":       housekeepers, mobile number + PIN (set by an admin)
//  - "hk-admin": module admin, email + password from env vars
//    HK_ADMIN_EMAIL, HK_ADMIN_PASSWORD_HASH (make one with scripts/hk-hash-secret.ts)
// Requires NEXTAUTH_SECRET. Without it nothing can sign in (fails closed).

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 14 * 24 * 60 * 60 },
  pages: { signIn: "/hk/login" },
  providers: [
    CredentialsProvider({
      id: "hk",
      name: "Housekeeper",
      credentials: {
        mobile: { label: "Mobile", type: "tel" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        const mobile = normalizeMobile(credentials?.mobile)
        const pin = credentials?.pin ?? ""
        if (!mobile || !pin) return null

        const user = await prisma.hkUser.findUnique({ where: { mobile } })
        // Same cost for unknown numbers, so response time doesn't reveal them.
        if (!user) {
          verifySecret(pin, "scrypt$00$00")
          return null
        }
        if (!user.isActive) return null
        if (isLocked(user.lockedUntil)) return null

        if (!verifySecret(pin, user.pinHash)) {
          const next = nextLockState(user.failedAttempts)
          await prisma.hkUser.update({ where: { id: user.id }, data: next })
          return null
        }

        await prisma.hkUser.update({
          where: { id: user.id },
          data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        })
        return { id: user.id, name: user.name, role: "HK" as const }
      },
    }),
    CredentialsProvider({
      id: "hk-admin",
      name: "Housekeeping admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const adminEmail = process.env.HK_ADMIN_EMAIL?.trim().toLowerCase()
        const adminHash = process.env.HK_ADMIN_PASSWORD_HASH
        if (!adminEmail || !adminHash) return null
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password ?? ""
        if (!email || !password) return null
        const passwordOk = verifySecret(password, adminHash)
        if (email !== adminEmail || !passwordOk) return null
        return { id: "hk-admin", name: "Admin", role: "ADMIN" as const }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid ?? "",
        name: token.name ?? null,
        role: token.role ?? "HK",
      }
      return session
    },
  },
}

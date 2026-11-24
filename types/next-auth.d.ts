import "next-auth"
import "next-auth/jwt"

export type HkRole = "HK" | "ADMIN"

declare module "next-auth" {
  interface User {
    role: HkRole
  }
  interface Session {
    user: {
      id: string
      name?: string | null
      role: HkRole
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string
    role?: HkRole
  }
}

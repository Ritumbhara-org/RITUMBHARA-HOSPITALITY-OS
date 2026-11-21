import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "./auth"
import { prisma } from "@/lib/prisma"

export class HkAuthError extends Error {
  constructor(message = "Not signed in") {
    super(message)
    this.name = "HkAuthError"
  }
}

// For server actions and route handlers: throws instead of redirecting.
export async function assertHkAdmin() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "ADMIN") throw new HkAuthError("Admin sign-in required")
  return session.user
}

// Re-checks the database so a deactivated housekeeper is cut off at once,
// even while their session cookie is still valid.
export async function assertHk() {
  const session = await getServerSession(authOptions)
  if (session?.user?.role !== "HK") throw new HkAuthError("Sign in required")
  const user = await prisma.hkUser.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, isActive: true },
  })
  if (!user || !user.isActive) throw new HkAuthError("Account is not active")
  return { id: user.id, name: user.name }
}

// For pages: redirects to the right login screen.
export async function requireHkAdmin() {
  try {
    return await assertHkAdmin()
  } catch {
    redirect("/hk-admin/login")
  }
}

export async function requireHk() {
  try {
    return await assertHk()
  } catch {
    redirect("/hk/login")
  }
}

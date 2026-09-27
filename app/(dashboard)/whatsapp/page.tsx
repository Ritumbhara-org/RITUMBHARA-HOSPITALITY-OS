import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getWhatsAppConversations } from "@/app/actions/whatsapp"
import { WhatsAppClient } from "@/components/whatsapp/whatsapp-client"

export default async function WhatsAppPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth-token")

  if (!token) {
    redirect("/login")
  }

  const threads = await getWhatsAppConversations()

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <WhatsAppClient initialThreads={threads} />
    </div>
  )
}

import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ritumbhara Hospitality OS",
  description: "A lightweight Hospitality Operations + Guest Engagement platform",
  applicationName: "Ritumbhara OS",
  // Installed on iPhone/iPad: open full screen with this name under the icon (icon: app/apple-icon.png).
  appleWebApp: { capable: true, title: "Ritumbhara OS", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#5c0a20",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={font.className}>
        {children}
        <Toaster />
        <RegisterServiceWorker enabled={process.env.NODE_ENV === "production"} />
      </body>
    </html>
  );
}

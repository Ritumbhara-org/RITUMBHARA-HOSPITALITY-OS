import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { RegisterServiceWorker } from "@/components/pwa/register-service-worker";

const font = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-latin" });
// Hindi text: Plus Jakarta Sans has no Devanagari letters, so the browser falls through to this font for them.
const devanagari = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "500", "600", "700"], variable: "--font-devanagari" });

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
  width: "device-width",
  initialScale: 1,
  // Lets the installed app draw under the notch/home bar; the shell pads itself with safe-area insets.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${font.variable} ${devanagari.variable}`}>
        {children}
        <Toaster />
        <RegisterServiceWorker enabled={process.env.NODE_ENV === "production"} />
      </body>
    </html>
  );
}

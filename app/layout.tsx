import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ritumbhara Hospitality OS",
  description: "Lightweight Hospitality Operations + Guest Engagement platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

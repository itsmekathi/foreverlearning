import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { TzCookie } from "@/components/TzCookie";
import "./globals.css";

const sans = Inter({ variable: "--font-sans-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ForeverLearning", template: "%s · ForeverLearning" },
  description: "Your PDF library: pick up where you left off, plan your reading, cover every chapter.",
  applicationName: "ForeverLearning",
  appleWebApp: { capable: true, title: "ForeverLearning", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/180" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} font-sans antialiased`}>
        <TzCookie />
        {children}
      </body>
    </html>
  );
}

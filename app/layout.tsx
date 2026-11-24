import type { Metadata, Viewport } from "next";
import { Urbanist } from "next/font/google";
import { APP_NAME, APP_URL } from "@/lib/site";
import "./globals.css";

const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-urbanist",
});

const description =
  "Practice investor pitches and client calls out loud against AI personas who push back, then get a scorecard on what to fix.";

export const viewport: Viewport = {
  themeColor: "#080809",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: { default: `${APP_NAME} · Practice pitches and client calls with AI`, template: `%s · ${APP_NAME}` },
  description,
  applicationName: APP_NAME,
  openGraph: { title: APP_NAME, description, siteName: APP_NAME, type: "website" },
  twitter: { card: "summary_large_image", title: APP_NAME, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={urbanist.variable}>
      <body className="min-h-dvh bg-bg font-sans font-medium text-ink antialiased">{children}</body>
    </html>
  );
}

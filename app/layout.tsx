import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AscendMaxx",
  description: "A self-improvement community focused on looksmaxxing, cognitive enhancement, and total life ascension.",
  keywords: ["looksmaxxing", "self-improvement", "biohacking", "moneymaxxing", "forum"],
  authors: [{ name: "AscendMaxx" }],
  openGraph: {
    title: "AscendMaxx",
    description: "A self-improvement community focused on looksmaxxing, cognitive enhancement, and total life ascension.",
    url: "https://ascendmaxx.me",
    siteName: "AscendMaxx",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "AscendMaxx",
    description: "A self-improvement community focused on looksmaxxing, cognitive enhancement, and total life ascension.",
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
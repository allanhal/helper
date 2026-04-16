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
  metadataBase: new URL("https://helper.app"),
  title: "Meeting Helper — AI Meeting Assistant",
  description:
    "Real-time meeting transcription and AI analysis that runs 100% locally on your Mac. No cloud, no data leaves your machine. Powered by Whisper and Ollama.",
  keywords: [
    "meeting assistant",
    "transcription",
    "AI",
    "local",
    "privacy",
    "Whisper",
    "Ollama",
    "macOS",
    "Electron",
  ],
  authors: [{ name: "Allan Pinheiro" }],
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "Meeting Helper — AI Meeting Assistant",
    description:
      "Real-time meeting transcription and AI analysis that runs 100% locally. No cloud, no data leaves your machine.",
    type: "website",
    locale: "en_US",
    siteName: "Meeting Helper",
    images: [
      {
        url: "/screenshot.jpg",
        width: 1200,
        height: 630,
        alt: "Meeting Helper app screenshot showing real-time meeting transcription",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meeting Helper — AI Meeting Assistant",
    description:
      "Real-time meeting transcription and AI analysis that runs 100% locally.",
    images: ["/screenshot.jpg"],
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
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <body className="bg-[#0a0a0a] text-[#ededed]">{children}</body>
    </html>
  );
}

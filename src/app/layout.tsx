import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TenderFlow — AI-Powered Tender Management",
  description:
    "The complete tender management system: capture, track, prepare, submit and win tenders with AI-assisted document reading, checklists and deadline management.",
  keywords: [
    "tender management",
    "PSIRA",
    "tender tracking",
    "RFQ",
    "RFP",
    "bid management",
    "compliance",
    "South Africa tenders",
  ],
  authors: [{ name: "TenderFlow" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "TenderFlow — AI-Powered Tender Management",
    description:
      "One central system to manage every tender from discovery to outcome.",
    siteName: "TenderFlow",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            {children}
            <Toaster />
            <SonnerToaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

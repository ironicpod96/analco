import type { Metadata } from "next"
import { Geist_Mono, Inter, Montserrat } from "next/font/google"

import { NavbarSlotsProvider } from "@/components/navbar-slots"
import { SiteHeader } from "@/components/site-header"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "AnalCo — Competitor UX audit",
  description:
    "Score up to 10 competitor websites across a unified UX rubric in a single batch.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.className} ${inter.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-hidden">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <NavbarSlotsProvider>
            <SiteHeader />
            <main className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
          </NavbarSlotsProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

import "./globals.css"
import "react-big-calendar/lib/css/react-big-calendar.css"
import { Inter } from "next/font/google"
import { Metadata } from "next"
import { Providers } from "@/components/providers"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Odonto SaaS",
  description: "Sistema SaaS para clínicas odontológicas",
  icons: { icon: "/favicon.ico" }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-inter bg-white text-black`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

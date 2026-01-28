"use client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactNode, useState } from "react"
import { ThemeProvider } from "next-themes"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/toast"

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light">
        <QueryClientProvider client={queryClient}>
          <Toaster position="top-right" />
          {children}
        </QueryClientProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}

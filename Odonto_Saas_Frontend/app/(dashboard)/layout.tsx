import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1">
        <Header />
        <main className="container py-6">{children}</main>
      </div>
    </div>
  )
}

"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { signOut } from "next-auth/react"
import { User2, LayoutDashboard, Hospital, Users, CalendarDays, Tooth, Wallet, Settings } from "lucide-react"

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clinics", label: "Clínicas", icon: Hospital },
  { href: "/dashboard/patients", label: "Pacientes", icon: Users },
  { href: "/dashboard/appointments", label: "Agendamentos", icon: CalendarDays },
  { href: "/dashboard/dentists", label: "Dentistas", icon: Tooth },
  { href: "/dashboard/services", label: "Serviços", icon: Wallet },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings }
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="flex h-full w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center justify-center border-b">
        <Link href="/dashboard" className="text-lg font-bold text-primary">Odonto SaaS</Link>
      </div>
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                    active ? "bg-primary/10 text-primary" : "hover:bg-gray-100"
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="border-t p-3">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <User2 size={18} />
          <div className="flex-1">
            <div className="font-medium">Usuário</div>
            <div className="text-gray-500">usuario@exemplo.com</div>
          </div>
        </div>
        <Button variant="ghost" className="mt-3 w-full" onClick={() => signOut({ callbackUrl: "/login" })}>
          Sair
        </Button>
      </div>
    </aside>
  )
}

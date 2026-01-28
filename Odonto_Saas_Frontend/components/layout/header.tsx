"use client"
import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"

export function Header({ onOpenMobile }: { onOpenMobile?: () => void }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" aria-label="Abrir menu" onClick={onOpenMobile}>
          <Menu />
        </Button>
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>
      <div className="text-sm text-gray-600">Bem-vindo!</div>
    </header>
  )
}

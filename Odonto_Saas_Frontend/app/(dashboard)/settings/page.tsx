"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Configurações</h2>
      <Card>
        <CardContent className="space-y-3">
          <div className="text-sm text-gray-700">Tema atual: {theme}</div>
          <div className="space-x-2">
            <Button onClick={() => setTheme("light")}>Modo Claro</Button>
            <Button variant="secondary" onClick={() => setTheme("dark")}>Modo Escuro</Button>
            <Button variant="ghost" onClick={() => setTheme("system")}>Sistema</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

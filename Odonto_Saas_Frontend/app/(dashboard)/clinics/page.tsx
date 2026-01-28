"use client"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function ClinicsPage() {
  const clinics = [
    { id: "1", nome: "Clínica Central", cnpj: "12.345.678/0001-99", telefone: "11 4002-8922", plano: "Pro", status: "Ativa" },
    { id: "2", nome: "Sorriso Feliz", cnpj: "98.765.432/0001-11", telefone: "11 3333-4444", plano: "Basic", status: "Ativa" }
  ]
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Clínicas</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clinics.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{c.nome}</div>
                <Badge variant="blue">{c.plano}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div><span className="text-gray-600">CNPJ:</span> {c.cnpj}</div>
              <div><span className="text-gray-600">Telefone:</span> {c.telefone}</div>
              <Badge variant={c.status === "Ativa" ? "green" : "red"}>{c.status}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

"use client"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { mockPatients } from "@/lib/mock"

export default function PatientDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const patient = mockPatients.find((p) => p.id === id)
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">Detalhes do Paciente</h2>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div><span className="text-gray-600">Nome:</span> {patient?.nome}</div>
          <div><span className="text-gray-600">Telefone:</span> {patient?.telefone}</div>
          <div><span className="text-gray-600">CPF:</span> {patient?.cpf}</div>
          <div><span className="text-gray-600">Email:</span> {patient?.email}</div>
          <div><span className="text-gray-600">Status:</span> {patient?.status}</div>
        </CardContent>
      </Card>
    </div>
  )
}

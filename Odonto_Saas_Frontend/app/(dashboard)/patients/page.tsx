"use client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter } from "@/components/ui/dialog"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { mockPatients } from "@/lib/mock"
import { useState } from "react"
import { PatientForm } from "@/components/forms/patient-form"
import { useToast } from "@/components/ui/toast"

type Patient = {
  id: string
  nome: string
  telefone: string
  cpf?: string
  email?: string
  status: "Ativo" | "Inativo"
}

export default function PatientsPage() {
  const qc = useQueryClient()
  const { success, error } = useToast()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"Todos" | "Ativo" | "Inativo">("Todos")
  const [open, setOpen] = useState(false)

  const { data = [] } = useQuery<Patient[]>({
    queryKey: ["patients", search, status],
    queryFn: async () => {
      try {
        const res = await api.get("/api/patients", { params: { q: search, status: status === "Todos" ? undefined : status } })
        return res.data
      } catch {
        return mockPatients
      }
    }
  })

  const createMutation = useMutation({
    mutationFn: async (payload: Omit<Patient, "id">) => {
      try {
        const res = await api.post("/api/patients", payload)
        return res.data
      } catch {
        return { ...payload, id: Math.random().toString(36).slice(2) }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patients"] })
      success("Paciente criado com sucesso")
      setOpen(false)
    },
    onError: () => error("Erro ao criar paciente")
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Pacientes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="success">+ Novo Paciente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader title="+ Novo Paciente" />
            <CardContent>
              <PatientForm
                onSubmit={(v) => createMutation.mutate({ ...v })}
                onCancel={() => setOpen(false)}
                loading={createMutation.isPending}
              />
            </CardContent>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              placeholder="Buscar (nome, telefone, CPF)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar pacientes"
            />
            <select
              className="h-10 rounded-lg border border-gray-300 px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              aria-label="Filtro de status"
            >
              <option>Todos</option>
              <option>Ativo</option>
              <option>Inativo</option>
            </select>
            <Button variant="ghost" onClick={() => { setSearch(""); setStatus("Todos") }}>Limpar filtros</Button>
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>Telefone</TH>
                <TH>CPF</TH>
                <TH>Email</TH>
                <TH>Status</TH>
                <TH>Ações</TH>
              </TR>
            </THead>
            <TBody>
              {data.slice(0, 10).map((p) => (
                <TR key={p.id}>
                  <TD>{p.nome}</TD>
                  <TD>{p.telefone}</TD>
                  <TD>{p.cpf}</TD>
                  <TD>{p.email}</TD>
                  <TD>{p.status}</TD>
                  <TD className="space-x-2">
                    <Button variant="ghost" size="sm">Ver</Button>
                    <Button variant="secondary" size="sm">Editar</Button>
                    <Button variant="warning" size="sm">Inativar</Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

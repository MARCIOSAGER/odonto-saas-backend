"use client"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { mockAppointments } from "@/lib/mock"
import { Calendar, dateFnsLocalizer } from "react-big-calendar"
import { format, parse, startOfWeek, getDay } from "date-fns"
import { ptBR } from "date-fns/locale"

const locales = { "pt-BR": ptBR }
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales })

type Appointment = {
  id: string
  data: string
  hora: string
  paciente: string
  dentista: string
  servico: string
  status: "Confirmado" | "Pendente" | "Cancelado"
}

export default function AppointmentsPage() {
  const [view, setView] = useState<"lista" | "calendario">("lista")
  const { data = [] } = useQuery<Appointment[]>({
    queryKey: ["appointments"],
    queryFn: async () => {
      try {
        const res = await api.get("/api/appointments")
        return res.data
      } catch {
        return mockAppointments
      }
    }
  })

  const events = useMemo(
    () =>
      data.map((a) => {
        const [h] = a.hora.split(":")
        const start = new Date(`${a.data}T${a.hora}:00`)
        const end = new Date(start)
        end.setHours(parseInt(h) + 1)
        return { id: a.id, title: `${a.paciente} • ${a.servico}`, start, end, resource: a }
      }),
    [data]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Agendamentos</h2>
        <div className="space-x-2">
          <Button variant={view === "lista" ? "primary" : "ghost"} onClick={() => setView("lista")}>Lista</Button>
          <Button variant={view === "calendario" ? "primary" : "ghost"} onClick={() => setView("calendario")}>Calendário</Button>
        </div>
      </div>
      <Card>
        <CardContent>
          {view === "lista" ? (
            <Table>
              <THead>
                <TR>
                  <TH>Data</TH>
                  <TH>Hora</TH>
                  <TH>Paciente</TH>
                  <TH>Dentista</TH>
                  <TH>Serviço</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.map((a) => (
                  <TR key={a.id}>
                    <TD>{a.data}</TD>
                    <TD>{a.hora}</TD>
                    <TD>{a.paciente}</TD>
                    <TD>{a.dentista}</TD>
                    <TD>{a.servico}</TD>
                    <TD>{a.status}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <div className="h-[700px]">
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                defaultView="week"
                views={["week", "month"]}
                messages={{
                  week: "Semana",
                  month: "Mês",
                  today: "Hoje",
                  previous: "Anterior",
                  next: "Próximo"
                }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

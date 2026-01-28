"use client"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { useGlobalStore } from "@/lib/store"
import { mockAppointments } from "@/lib/mock"
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

type Appointment = {
  id: string
  data: string
  hora: string
  paciente: string
  dentista: string
  servico: string
  status: "Confirmado" | "Pendente" | "Cancelado"
}

export default function DashboardHome() {
  const mockMode = useGlobalStore((s) => s.mockMode)
  const { data } = useQuery<Appointment[]>({
    queryKey: ["appointments", "upcoming"],
    queryFn: async () => {
      try {
        const res = await api.get("/api/appointments?range=30")
        return res.data
      } catch {
        return mockAppointments
      }
    }
  })

  const appointments = data || []
  const todayCount = appointments.filter((a) => a.status !== "Cancelado").slice(0, 5).length
  const sevenDays = appointments.length
  const occupancy = Math.round((appointments.filter((a) => a.status === "Confirmado").length / Math.max(appointments.length, 1)) * 100)

  const chartData = appointments.slice(0, 30).map((a, i) => ({ date: a.data, count: i % 5 }))

  return (
    <div className="space-y-6">
      {mockMode && (
        <div className="rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
          Modo desenvolvimento - usando dados mock
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Total Pacientes" value={350} icon="👥" />
        <MetricCard title="Agendamentos Hoje" value={todayCount} icon="📅" />
        <MetricCard title="Próximos 7 dias" value={sevenDays} icon="📆" />
        <MetricCard title="Taxa Ocupação" value={`${occupancy}%`} icon="📊" />
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Agendamentos - Últimos 30 dias</h3>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="#eee" strokeDasharray="5 5" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#0066CC" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Próximos Agendamentos</h3>
            <Button variant="secondary">Ver todos</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Data</TH>
                <TH>Hora</TH>
                <TH>Paciente</TH>
                <TH>Dentista</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {appointments.slice(0, 8).map((a) => (
                <TR key={a.id}>
                  <TD>{a.data}</TD>
                  <TD>{a.hora}</TD>
                  <TD>{a.paciente}</TD>
                  <TD>{a.dentista}</TD>
                  <TD>
                    <Badge
                      variant={a.status === "Confirmado" ? "green" : a.status === "Pendente" ? "yellow" : "red"}
                    >
                      {a.status}
                    </Badge>
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

function MetricCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-600">{title}</div>
            <div className="mt-1 text-2xl font-bold">{value}</div>
          </div>
          <div className="text-3xl">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

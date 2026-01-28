"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { mockDentists } from "@/lib/mock"

export default function DentistsPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Dentistas</h2>
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>CRO</TH>
                <TH>Especialidade</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {mockDentists.map((d) => (
                <TR key={d.id}>
                  <TD>{d.nome}</TD>
                  <TD>{d.cro}</TD>
                  <TD>{d.especialidade}</TD>
                  <TD>{d.status}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

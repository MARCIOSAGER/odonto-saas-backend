"use client"
import { Card, CardContent } from "@/components/ui/card"
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table"
import { mockServices } from "@/lib/mock"

export default function ServicesPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Serviços</h2>
      <Card>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Nome</TH>
                <TH>Descrição</TH>
                <TH>Preço</TH>
                <TH>Duração</TH>
              </TR>
            </THead>
            <TBody>
              {mockServices.map((s) => (
                <TR key={s.id}>
                  <TD>{s.nome}</TD>
                  <TD>{s.descricao}</TD>
                  <TD>{`R$ ${s.preco.toFixed(2)}`}</TD>
                  <TD>{s.duracao} min</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

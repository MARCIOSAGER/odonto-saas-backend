import { addDays, formatISO } from "date-fns"

export const mockPatients = Array.from({ length: 10 }, (_, i) => ({
  id: `${i + 1}`,
  nome: `Paciente ${i + 1}`,
  telefone: "11 99999-9999",
  cpf: `000.000.00${i}-00`,
  email: `paciente${i + 1}@exemplo.com`,
  status: i % 2 === 0 ? "Ativo" : "Inativo"
}))

export const mockDentists = Array.from({ length: 3 }, (_, i) => ({
  id: `${i + 1}`,
  nome: `Dentista ${i + 1}`,
  cro: `CRO-${1000 + i}`,
  especialidade: ["Ortodontia", "Endodontia", "Clínico Geral"][i % 3],
  status: "Ativo"
}))

export const mockServices = Array.from({ length: 6 }, (_, i) => ({
  id: `${i + 1}`,
  nome: `Serviço ${i + 1}`,
  descricao: "Descrição do serviço",
  preco: 150 + i * 50,
  duracao: 30 + i * 10
}))

export const mockAppointments = Array.from({ length: 15 }, (_, i) => ({
  id: `${i + 1}`,
  data: formatISO(addDays(new Date(), i % 7), { representation: "date" }),
  hora: `${9 + (i % 8)}:00`,
  paciente: mockPatients[i % mockPatients.length].nome,
  dentista: mockDentists[i % mockDentists.length].nome,
  servico: mockServices[i % mockServices.length].nome,
  status: ["Confirmado", "Pendente", "Cancelado"][i % 3]
}))


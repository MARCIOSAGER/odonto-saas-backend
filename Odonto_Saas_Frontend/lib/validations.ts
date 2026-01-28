import { z } from "zod"

export const loginSchema = z.object({
  email: z.string().email({ message: "Email inválido" }),
  password: z.string().min(6, { message: "Senha deve ter no mínimo 6 caracteres" })
})
export type LoginInput = z.infer<typeof loginSchema>

export const patientSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  telefone: z.string().min(8, "Telefone é obrigatório"),
  cpf: z.string().optional(),
  email: z.string().email().optional(),
  dataNascimento: z.string().optional(),
  endereco: z.string().optional(),
  status: z.enum(["Ativo", "Inativo"])
})
export type PatientInput = z.infer<typeof patientSchema>

export const appointmentSchema = z.object({
  pacienteId: z.string().min(1, "Paciente é obrigatório"),
  dentistaId: z.string().min(1, "Dentista é obrigatório"),
  servicoId: z.string().min(1, "Serviço é obrigatório"),
  data: z.string().min(1, "Data é obrigatória"),
  hora: z.string().min(1, "Hora é obrigatória"),
  observacoes: z.string().optional()
})
export type AppointmentInput = z.infer<typeof appointmentSchema>

export const clinicSchema = z.object({
  nome: z.string().min(1),
  cnpj: z.string().min(14),
  telefone: z.string().min(8),
  plano: z.string().optional(),
  status: z.enum(["Ativa", "Inativa"])
})
export type ClinicInput = z.infer<typeof clinicSchema>

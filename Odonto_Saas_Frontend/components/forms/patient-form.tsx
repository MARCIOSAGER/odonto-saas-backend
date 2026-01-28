"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { patientSchema, PatientInput } from "@/lib/validations"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function PatientForm({ onSubmit, onCancel, loading }: { onSubmit: (values: PatientInput) => void; onCancel?: () => void; loading?: boolean }) {
  const { register, handleSubmit, formState: { errors } } = useForm<PatientInput>({
    resolver: zodResolver(patientSchema),
    defaultValues: { status: "Ativo" }
  })
  return (
    <form className="space-y-3" onSubmit={handleSubmit(onSubmit)} aria-label="Formulário de paciente">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Nome completo *</label>
          <Input {...register("nome")} aria-invalid={!!errors.nome} />
          {errors.nome && <p className="mt-1 text-xs text-error">{errors.nome.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Telefone *</label>
          <Input {...register("telefone")} aria-invalid={!!errors.telefone} />
          {errors.telefone && <p className="mt-1 text-xs text-error">{errors.telefone.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">CPF</label>
          <Input {...register("cpf")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <Input type="email" {...register("email")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Data nascimento</label>
          <Input type="date" {...register("dataNascimento")} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Status</label>
          <select className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm" {...register("status")}>
            <option>Ativo</option>
            <option>Inativo</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">Endereço</label>
          <textarea className="h-24 w-full rounded-lg border border-gray-300 p-3 text-sm" {...register("endereco")} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={loading} aria-busy={loading}>Salvar</Button>
      </div>
    </form>
  )
}

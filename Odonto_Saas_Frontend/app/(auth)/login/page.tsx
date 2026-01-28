"use client"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { loginSchema, LoginInput } from "@/lib/validations"
import { signIn } from "next-auth/react"
import { useState } from "react"
import { useToast } from "@/components/ui/toast"
import { useGlobalStore } from "@/lib/store"

export default function LoginPage() {
  const { success, error } = useToast()
  const setToken = useGlobalStore((s) => s.setToken)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })
  const [apiError, setApiError] = useState<string | null>(null)

  const onSubmit = async (data: LoginInput) => {
    setApiError(null)
    const res = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false
    })
    if (res?.ok) {
      success("Login realizado com sucesso")
      // recupera token da sessão (será anexado nas chamadas)
      // como fallback, seta token local se backend retornar via authorize
      // NextAuth injeta token na sessão nas rotas protegidas
      // aqui apenas redirecionamos
      setTimeout(() => {
        window.location.href = "/dashboard"
      }, 300)
    } else {
      setApiError("Email ou senha inválidos")
      error("Falha na autenticação")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex flex-col items-center">
            <div className="text-2xl font-bold text-primary">Odonto SaaS</div>
            <div className="mt-1 text-sm text-gray-600">Bem-vindo! Faça login para continuar.</div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" aria-label="Formulário de login">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <Input id="email" type="email" placeholder="seu@email.com" aria-invalid={!!errors.email} {...register("email")} />
              {errors.email && <p className="mt-1 text-xs text-error">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">
                Senha
              </label>
              <Input id="password" type="password" placeholder="Sua senha" aria-invalid={!!errors.password} {...register("password")} />
              {errors.password && <p className="mt-1 text-xs text-error">{errors.password.message}</p>}
            </div>
            {apiError && <p className="text-sm text-error">{apiError}</p>}
            <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full">
              {isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
          <div className="mt-3 text-center text-sm">
            Não tem conta? <Link href="/register" className="text-primary">Criar conta</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

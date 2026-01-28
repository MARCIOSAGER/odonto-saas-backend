"use client"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useForm } from "react-hook-form"

export default function RegisterPage() {
  const { register, handleSubmit } = useForm<{ email: string; password: string }>()
  const onSubmit = () => {
    alert("Registro não implementado ainda. Contate o suporte.")
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="text-2xl font-bold text-primary text-center">Criar conta</div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
              <Input id="email" type="email" {...register("email")} />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium">Senha</label>
              <Input id="password" type="password" {...register("password")} />
            </div>
            <Button type="submit" className="w-full">Registrar</Button>
          </form>
          <div className="mt-3 text-center text-sm">
            Já possui conta? <Link href="/login" className="text-primary">Entrar</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

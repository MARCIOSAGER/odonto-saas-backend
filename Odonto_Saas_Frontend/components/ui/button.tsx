"use client"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"
import React from "react"

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean
  variant?: "primary" | "secondary" | "success" | "warning" | "error" | "ghost"
  size?: "sm" | "md" | "lg"
}

export function Button({ asChild, className, variant = "primary", size = "md", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"
  const base =
    "inline-flex items-center justify-center rounded-lg shadow-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
  const heights = size === "sm" ? "h-9 px-3 text-sm" : size === "lg" ? "h-12 px-6 text-base" : "h-10 px-4 text-sm"
  const variants =
    variant === "primary"
      ? "bg-primary text-white hover:bg-[#005CB8]"
      : variant === "secondary"
      ? "bg-secondary text-white hover:bg-[#0094CB]"
      : variant === "success"
      ? "bg-success text-white hover:bg-emerald-600"
      : variant === "warning"
      ? "bg-warning text-white hover:bg-amber-600"
      : variant === "error"
      ? "bg-error text-white hover:bg-red-600"
      : "bg-transparent text-primary hover:bg-gray-100"
  return <Comp className={cn(base, heights, variants, className)} {...props} />
}

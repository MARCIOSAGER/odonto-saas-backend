"use client"
import React from "react"
import { cn } from "@/lib/utils"

export function Badge({ children, variant = "gray", className }: { children: React.ReactNode; variant?: "green" | "yellow" | "red" | "blue" | "gray"; className?: string }) {
  const color =
    variant === "green"
      ? "bg-success/15 text-success"
      : variant === "yellow"
      ? "bg-warning/15 text-warning"
      : variant === "red"
      ? "bg-error/15 text-error"
      : variant === "blue"
      ? "bg-secondary/15 text-secondary"
      : "bg-gray-100 text-gray-600"
  return (
    <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium", color, className)}>
      {children}
    </span>
  )
}

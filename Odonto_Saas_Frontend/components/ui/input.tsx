"use client"
import React from "react"
import { cn } from "@/lib/utils"

type Props = React.InputHTMLAttributes<HTMLInputElement>
export function Input({ className, ...props }: Props) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary",
        "disabled:bg-gray-100 disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

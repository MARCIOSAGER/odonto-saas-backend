"use client"
import * as SelectPrimitive from "@radix-ui/react-select"
import { cn } from "@/lib/utils"
import React from "react"

export const Select = SelectPrimitive.Root
export const SelectValue = SelectPrimitive.Value

export function SelectTrigger({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "h-10 w-full rounded-lg border border-gray-300 px-3 text-left text-sm",
        "flex items-center justify-between",
        "focus:outline-none focus:ring-2 focus:ring-primary",
        className
      )}
    >
      <SelectValue />
      {children}
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ children }: { children: React.ReactNode }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content className="z-50 rounded-lg border border-gray-200 bg-white shadow-sm">
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className={cn(
        "cursor-pointer rounded-md px-3 py-2 text-sm",
        "data-[highlighted]:bg-gray-100 data-[state=checked]:bg-secondary data-[state=checked]:text-white"
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

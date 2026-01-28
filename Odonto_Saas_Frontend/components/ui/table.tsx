"use client"
import React from "react"
import { cn } from "@/lib/utils"

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full text-sm", className)} {...props} />
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}
export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}
export function TR(props: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className="border-b last:border-0" {...props} />
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("text-left p-3 text-gray-600", className)} {...props} />
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("p-3", className)} {...props} />
}

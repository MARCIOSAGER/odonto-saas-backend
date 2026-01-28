"use client"
import React, { useMemo } from "react"
import { addDays, startOfWeek, format } from "date-fns"
import { ptBR } from "date-fns/locale"

export function MiniCalendar({ date = new Date() }: { date?: Date }) {
  const days = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [date])
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between p-3">
        <div className="text-sm font-semibold">{format(date, "MMMM yyyy", { locale: ptBR })}</div>
      </div>
      <div className="grid grid-cols-7 gap-1 p-3 text-center text-xs text-gray-600">
        {days.map((d) => (
          <div key={d.toISOString()} className="rounded-md bg-gray-50 p-2">
            <div className="font-medium">{format(d, "EEE", { locale: ptBR })}</div>
            <div className="text-gray-800">{format(d, "d", { locale: ptBR })}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

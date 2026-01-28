"use client"
import { create } from "zustand"
import { useEffect } from "react"

type ToastType = "success" | "error" | "warning" | "info"
type Toast = { id: string; message: string; type: ToastType }

type ToastStore = {
  toasts: Toast[]
  add: (t: Omit<Toast, "id">) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (t) =>
    set((s) => ({
      toasts: [
        ...s.toasts,
        { id: Math.random().toString(36).slice(2), ...t }
      ]
    })),
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
}))

export function useToast() {
  const add = useToastStore((s) => s.add)
  return {
    success: (message: string) => add({ message, type: "success" }),
    error: (message: string) => add({ message, type: "error" }),
    warning: (message: string) => add({ message, type: "warning" }),
    info: (message: string) => add({ message, type: "info" })
  }
}

export function Toaster({ position = "top-right" }: { position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" }) {
  const toasts = useToastStore((s) => s.toasts)
  const remove = useToastStore((s) => s.remove)
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((t) =>
      setTimeout(() => remove(t.id), 3500)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, remove])
  const posClass =
    position === "top-right"
      ? "top-4 right-4"
      : position === "top-left"
      ? "top-4 left-4"
      : position === "bottom-right"
      ? "bottom-4 right-4"
      : "bottom-4 left-4"
  return (
    <div className={`fixed z-50 ${posClass} flex flex-col gap-2`}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className={`min-w-[260px] rounded-lg shadow-sm px-4 py-3 text-white ${
            t.type === "success"
              ? "bg-success"
              : t.type === "error"
              ? "bg-error"
              : t.type === "warning"
              ? "bg-warning"
              : "bg-secondary"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

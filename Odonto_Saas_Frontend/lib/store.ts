"use client"
import { create } from "zustand"

type GlobalState = {
  token?: string
  mockMode: boolean
  setToken: (t?: string) => void
  setMockMode: (v: boolean) => void
}

export const useGlobalStore = create<GlobalState>((set) => ({
  token: undefined,
  mockMode: false,
  setToken: (t) => set({ token: t }),
  setMockMode: (v) => set({ mockMode: v })
}))

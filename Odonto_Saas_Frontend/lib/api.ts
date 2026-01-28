import axios from "axios"
import { useGlobalStore } from "@/lib/store"
import { getSession } from "next-auth/react"

const baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export const api = axios.create({
  baseURL
})

api.interceptors.request.use(async (config) => {
  const localToken = useGlobalStore.getState().token
  let token = localToken
  if (!token) {
    const session = await getSession()
    token = (session as any)?.accessToken
  }
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    console.error("API Error:", error?.response?.data || error.message)
    // ativa modo mock para falhas de rede
    useGlobalStore.getState().setMockMode(true)
    return Promise.reject(error)
  }
)

export type ApiError = {
  message?: string
  status?: number
}

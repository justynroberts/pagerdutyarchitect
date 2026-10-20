import { create } from 'zustand'

let timer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<{ message: string | null; show: (m: string) => void }>((set) => ({
  message: null,
  show: (message) => {
    set({ message })
    clearTimeout(timer)
    timer = setTimeout(() => set({ message: null }), 3200)
  },
}))

"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

type SlotsCtx = {
  leftEl: HTMLElement | null
  rightEl: HTMLElement | null
  setLeftEl: (el: HTMLElement | null) => void
  setRightEl: (el: HTMLElement | null) => void
}

const Ctx = createContext<SlotsCtx | null>(null)

export function NavbarSlotsProvider({ children }: { children: ReactNode }) {
  const [leftEl, setLeftEl] = useState<HTMLElement | null>(null)
  const [rightEl, setRightEl] = useState<HTMLElement | null>(null)
  return (
    <Ctx.Provider value={{ leftEl, rightEl, setLeftEl, setRightEl }}>
      {children}
    </Ctx.Provider>
  )
}

export function useNavbarSlots() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useNavbarSlots must be used inside NavbarSlotsProvider")
  return ctx
}

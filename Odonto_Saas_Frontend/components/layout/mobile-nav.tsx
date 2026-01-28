"use client"
import { Sidebar } from "./sidebar"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useState } from "react"

export function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <Sidebar />
        </DialogContent>
      </Dialog>
    </>
  )
}


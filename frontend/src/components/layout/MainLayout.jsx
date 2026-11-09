
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { X } from 'lucide-react'

import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-100 flex">

      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">

          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div className="relative w-72 max-w-[85vw] h-full">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-3 z-50 p-2 text-white hover:bg-slate-800 rounded-lg"
              aria-label="Close menu"
            >
              <X size={21} />
            </button>

            <Sidebar />
          </div>
        </div>
      )}

      {/* Main application area */}
      <div className="flex-1 min-w-0 flex flex-col">

        <Topbar
          title="Dashboard"
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="flex-1 p-5 md:p-8">
          <Outlet />
        </main>

      </div>
    </div>
  )
}

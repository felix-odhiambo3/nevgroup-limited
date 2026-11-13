
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Sidebar from './Sidebar'
import Topbar from './Topbar'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/staff': 'Staff Management',
  '/attendance': 'Attendance & Shifts',
  '/check-in': 'Vehicle Check-in',
}

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  const pageTitle = pageTitles[location.pathname] || 'NEV CARWASH'

  return (
    <div className="flex min-h-screen bg-slate-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-64">
        <Topbar
          title={pageTitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className="w-full flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

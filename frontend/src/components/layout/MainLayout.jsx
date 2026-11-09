
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import Sidebar from './Sidebar'
import Topbar from './Topbar'

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const location = useLocation()

  const pageTitles = {
    '/dashboard': 'Dashboard',
    '/staff': 'Staff Management',
  }

  const pageTitle = pageTitles[location.pathname] || 'NEV CARWASH'

  return (
    <div className="min-h-screen bg-slate-100 flex">

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main application area */}
      <div className="flex-1 min-w-0 min-h-screen flex flex-col lg:ml-64">

        {/* Topbar */}
        <Topbar
          title={pageTitle}
          onMenuClick={() => setSidebarOpen(true)}
        />

        {/* Page content */}
        <main className="flex-1 w-full p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>

      </div>
    </div>
  )
}

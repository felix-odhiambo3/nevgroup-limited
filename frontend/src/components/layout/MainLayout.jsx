
import { useState, useRef, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MessageCircle, GripVertical } from 'lucide-react'

import Sidebar from './Sidebar'
import Topbar from './Topbar'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/my-day': 'MyDay',
  '/staff': 'Staff Management',
  '/services': 'Services Management',
  '/attendance': 'Attendance & Shifts',
  '/my-attendance': 'My Attendance',
  '/check-in': 'Vehicle Check-in',
  '/monitor-assignments': 'Monitor Assignments',
  '/invoices': 'Invoice Management',
  '/commissions': 'Cleaner Commissions',
  '/commission-payouts': 'Commission Payouts',
  '/commission-adjustments': 'Commission Adjustments',
}

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [position, setPosition] = useState({
    x: Math.max(8, window.innerWidth - 190),
    y: Math.max(8, window.innerHeight - 90),
  })

  const [dragging, setDragging] = useState(false)

  const location = useLocation()
  const dragRef = useRef(null)
  const movedRef = useRef(false)

  const pageTitle =
    pageTitles[location.pathname] || 'NEV CARWASH'

  const whatsappUrl =
    'https://wa.me/254742171072?text=' +
    encodeURIComponent('Hello Admin, I need assistance with NEV CARWASH.')

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return

    event.preventDefault()

    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: position.x,
      startY: position.y,
    }

    movedRef.current = false
    setDragging(true)
  }

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!dragRef.current) return

      const deltaX = event.clientX - dragRef.current.pointerX
      const deltaY = event.clientY - dragRef.current.pointerY

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        movedRef.current = true
      }

      const buttonWidth = 180
      const buttonHeight = 55

      setPosition({
        x: Math.min(
          Math.max(8, dragRef.current.startX + deltaX),
          window.innerWidth - buttonWidth - 8
        ),
        y: Math.min(
          Math.max(8, dragRef.current.startY + deltaY),
          window.innerHeight - buttonHeight - 8
        ),
      })
    }

    const handlePointerUp = () => {
      if (dragRef.current) {
        dragRef.current = null
        setDragging(false)
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [])

  const handleClick = (event) => {
    if (movedRef.current) {
      event.preventDefault()
      event.stopPropagation()
      movedRef.current = false
    }
  }

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

      {/* Draggable WhatsApp Button */}
      <div
        onPointerDown={handlePointerDown}
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 99999,
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        className="flex items-center gap-2 rounded-full bg-green-600 px-5 py-3 text-white shadow-xl hover:bg-green-700"
      >
        <GripVertical size={16} />
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          draggable="false"
          className="flex items-center gap-2 whitespace-nowrap text-sm font-bold"
        >
          <MessageCircle size={23} />
          Chat Admin
        </a>
      </div>
    </div>
  )
}

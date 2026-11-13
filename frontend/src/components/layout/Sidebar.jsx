
import { NavLink } from 'react-router-dom'

import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CarFront,
  Building2,
  X,
} from 'lucide-react'

import { useAuth } from '../../features/auth/AuthContext'
import { canAccessRoute } from '../../config/rolePermissions'

const navigation = [
  {
    title: 'OVERVIEW',
    items: [
      {
        name: 'Dashboard',
        path: '/dashboard',
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      {
        name: 'Staff Management',
        path: '/staff',
        icon: Users,
      },
      {
        name: 'Attendance & Shifts',
        path: '/attendance',
        icon: ClipboardCheck,
      },
      {
        name: 'Check-in',
        path: '/check-in',
        icon: CarFront,
      },
    ],
  },
]

export default function Sidebar({ isOpen = false, onClose }) {
  const { user } = useAuth()

  const visibleGroups = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        canAccessRoute(user, item.path)
      ),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50
        flex w-64 flex-col bg-slate-950 text-white
        transform transition-transform duration-300
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      <div className="flex items-center justify-between border-b border-red-700 bg-red-600 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl">
            <img
              src="/favicon.svg"
              alt="NEV CARWASH Logo"
              className="h-full w-full object-contain"
            />
          </div>

          <div>
            <h1 className="text-lg font-bold tracking-wide">
              NEV CARWASH
            </h1>

            <p className="text-xs font-bold text-yellow-300">
              Management System
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 text-white hover:text-slate-200 lg:hidden"
          aria-label="Close navigation menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-4 py-6">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-3 px-3 text-xs font-semibold tracking-widest text-slate-500">
              {group.title}
            </p>

            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`
                    }
                  >
                    <Icon size={19} />
                    <span>{item.name}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-5 py-5">
        <div className="flex items-center gap-2 text-slate-400">
          <Building2 size={16} />
          <span className="text-xs">A NevGroup Branch</span>
        </div>
      </div>
    </aside>
  )
}

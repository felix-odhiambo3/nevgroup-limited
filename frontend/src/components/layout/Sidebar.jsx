
import { NavLink } from 'react-router-dom'

import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CarFront,
  Wrench,
  CreditCard,
  BarChart3,
  Settings,
  Building2,
  X,
} from 'lucide-react'

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
        icon: ClipboardCheck,
      },
      {
        name: 'Vehicle Visits',
        icon: CarFront,
      },
      {
        name: 'Services & Pricing',
        icon: Wrench,
      },
      {
        name: 'Payments',
        icon: CreditCard,
      },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      {
        name: 'Reports',
        icon: BarChart3,
      },
      {
        name: 'Settings',
        icon: Settings,
      },
    ],
  },
]

export default function Sidebar({ isOpen = false, onClose }) {
  return (
    <aside
      className={`
        fixed inset-y-0 left-0 z-50
        w-64 bg-slate-950 text-white
        flex flex-col
        transform transition-transform duration-300
        lg:translate-x-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >

      {/* Brand */}
      <div className="px-5 py-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg">
            NC
          </div>

          <div>
            <h1 className="font-bold text-lg tracking-wide">
              NEV CARWASH
            </h1>

            <p className="text-xs text-slate-400">
              Management System
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="lg:hidden p-2 text-slate-400 hover:text-white"
          aria-label="Close navigation menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-7 overflow-y-auto">

        {navigation.map((group) => (
          <div key={group.title}>

            <p className="text-xs font-semibold text-slate-500 tracking-widest px-3 mb-3">
              {group.title}
            </p>

            <div className="space-y-1">

              {group.items.map((item) => {
                const Icon = item.icon

                if (!item.path) {
                  return (
                    <div
                      key={item.name}
                      title="Module setup in progress"
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-slate-500 cursor-not-allowed"
                    >
                      <Icon size={19} />
                      <span>{item.name}</span>
                    </div>
                  )
                }

                return (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
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

      {/* Footer */}
      <div className="px-5 py-5 border-t border-slate-800">
        <div className="flex items-center gap-2 text-slate-400">
          <Building2 size={16} />

          <span className="text-xs">
            A Diamond Space Limited Branch
          </span>
        </div>
      </div>

    </aside>
  )
}

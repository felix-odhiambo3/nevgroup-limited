
import {
  Users,
  ClipboardCheck,
  CarFront,
  Wrench,
  CreditCard,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

const modules = [
  {
    title: 'Staff Management',
    description: 'Manage employees and staff accounts.',
    icon: Users,
  },
  {
    title: 'Attendance & Shifts',
    description: 'Monitor staff attendance and shift assignments.',
    icon: ClipboardCheck,
  },
  {
    title: 'Vehicle Visits',
    description: 'Manage customer vehicles and carwash visits.',
    icon: CarFront,
  },
  {
    title: 'Services & Pricing',
    description: 'Manage carwash services and pricing.',
    icon: Wrench,
  },
  {
    title: 'Payments',
    description: 'Monitor customer payments and transactions.',
    icon: CreditCard,
  },
]

export default function DashboardPage() {
  const { user } = useAuth()

  const fullName = [
    user?.first_name,
    user?.last_name,
  ].filter(Boolean).join(' ') || user?.username || 'User'

  return (
    <div className="space-y-8">
      {/* Welcome section */}
      <section>
        <h1 className="text-2xl font-bold text-slate-900">
          Management Dashboard
        </h1>

        <p className="mt-2 text-slate-600">
          Welcome back, {fullName}.
        </p>

        <p className="text-sm text-slate-500 mt-1">
          Manage your NEV CARWASH operations from one central platform.
        </p>
      </section>

      {/* Account information */}
      <section className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Account Information
        </h2>

        <p className="text-sm text-slate-500 mt-1 mb-5">
          Your authenticated account details.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-slate-500">Username</p>
            <p className="font-medium text-slate-900 mt-1">
              {user?.username || 'Not available'}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Email</p>
            <p className="font-medium text-slate-900 mt-1">
              {user?.email || 'Not provided'}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Account Role</p>
            <p className="font-medium text-slate-900 mt-1">
              {user?.role || 'Not assigned'}
            </p>
          </div>
        </div>
      </section>

      {/* Management modules */}
      <section>
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Management Modules
          </h2>

          <p className="text-sm text-slate-500 mt-1">
            Core areas of the NEV CARWASH management system.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {modules.map((module) => {
            const Icon = module.icon

            return (
              <div
                key={module.title}
                className="bg-white border border-slate-200 rounded-xl p-6"
              >
                <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                  <Icon size={22} />
                </div>

                <h3 className="font-semibold text-slate-900">
                  {module.title}
                </h3>

                <p className="text-sm text-slate-500 mt-2">
                  {module.description}
                </p>

                <span className="inline-block mt-4 text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                  Module setup in progress
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="text-center text-xs text-slate-400 py-4">
        NEV CARWASH · A Diamond Space Limited Branch
      </footer>
    </div>
  )
}

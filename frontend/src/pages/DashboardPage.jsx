
import { Link } from 'react-router-dom'

import {
  Users,
  ClipboardCheck,
  CarFront,
  ArrowRight,
  ShieldCheck,
  Wallet,
  UserRound,
  BriefcaseBusiness,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  ROLES,
  getUserRole,
  getRoleLabel,
  canAccessRoute,
} from '../config/rolePermissions'

const workspaceDetails = {
  [ROLES.OWNER]: {
    heading: 'Company Overview',
    description:
      'Oversee NEV CARWASH operations and access the management areas available to your account.',
    icon: ShieldCheck,
  },

  [ROLES.ADMIN]: {
    heading: 'Administration Workspace',
    description:
      'Manage staff, monitor attendance and coordinate carwash operations.',
    icon: BriefcaseBusiness,
  },

  [ROLES.SUPERVISOR]: {
    heading: 'Branch Operations',
    description:
      'Manage your permitted operational activities and monitor attendance for your branch.',
    icon: ClipboardCheck,
  },

  [ROLES.ACCOUNTS]: {
    heading: 'Accounts Workspace',
    description:
      'Your account is recognized. Financial screens will appear here when their frontend workflows are implemented.',
    icon: Wallet,
  },

  [ROLES.CLEANER]: {
    heading: 'My Work',
    description:
      'Your personal assignment workspace is being prepared. It will show only work assigned to you and your individual completion status.',
    icon: UserRound,
  },

  [ROLES.DETAILER]: {
    heading: 'Vehicle Detailing Operations',
    description:
      'Access vehicle check-in and the operational activities permitted for your role.',
    icon: CarFront,
  },
}

const workspaceLinks = [
  {
    title: 'Staff Management',
    description: 'View and manage staff accounts and employee records.',
    path: '/staff',
    icon: Users,
  },
  {
    title: 'Attendance & Shifts',
    description: 'Monitor attendance, shifts and authorized attendance actions.',
    path: '/attendance',
    icon: ClipboardCheck,
  },
  {
    title: 'Vehicle Check-in',
    description: 'Register eligible vehicles and create service visits.',
    path: '/check-in',
    icon: CarFront,
  },
]

export default function DashboardPage() {
  const { user } = useAuth()

  const role = getUserRole(user)
  const roleLabel = getRoleLabel(user)

  const fullName = [
    user?.first_name,
    user?.last_name,
  ]
    .filter(Boolean)
    .join(' ') || user?.username || 'User'

  const details = workspaceDetails[role]
  const WorkspaceIcon = details?.icon || BriefcaseBusiness

  const availableLinks = workspaceLinks.filter((item) =>
    canAccessRoute(user, item.path)
  )

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <section>
        <p className="text-sm font-semibold uppercase tracking-wider text-red-600">
          NEV CARWASH
        </p>

        <h1 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">
          Welcome back, {fullName}
        </h1>

        <p className="mt-2 text-slate-600">
          You are signed in as {roleLabel}.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <WorkspaceIcon size={25} />
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {details?.heading || 'Your Workspace'}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {details?.description}
            </p>
          </div>
        </div>
      </section>

      {availableLinks.length > 0 && (
        <section>
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900">
              Your Available Workspaces
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Open an area available to your account.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {availableLinks.map((item) => {
              const Icon = item.icon

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Icon size={22} />
                  </div>

                  <h3 className="font-semibold text-slate-900">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {item.description}
                  </p>

                  <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-blue-600">
                    Open workspace
                    <ArrowRight
                      size={16}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {availableLinks.length === 0 && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="font-semibold text-slate-900">
            Your workspace is being prepared
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Only features that are ready and authorized for your role will appear here.
            You will see your available work tools as their workflows are implemented.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">
          Account Information
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Username
            </p>
            <p className="mt-1 font-medium text-slate-900">
              {user?.username || 'Not available'}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </p>
            <p className="mt-1 font-medium text-slate-900">
              {user?.email || 'Not provided'}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Account Role
            </p>
            <p className="mt-1 font-medium text-slate-900">
              {roleLabel}
            </p>
          </div>
        </div>
      </section>

      <footer className="py-4 text-center text-xs text-slate-400">
        NEV CARWASH · A Diamond Space Limited Branch
      </footer>
    </div>
  )
}

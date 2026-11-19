import { useCallback, useEffect, useMemo, useState } from 'react'
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
  ClipboardList,
  RefreshCw,
  CalendarDays,
  Clock3,
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  Smartphone,
  Banknote,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  ROLES,
  getUserRole,
  getRoleLabel,
  canAccessRoute,
} from '../config/rolePermissions'

import {
  getSupervisorWorkload,
  getSupervisorAttendance,
  getSupervisorRevenue,
} from '../api/supervisorDashboard'


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
      'Manage staff, monitor attendance, review assignments and coordinate carwash operations.',
    icon: BriefcaseBusiness,
  },

  [ROLES.SUPERVISOR]: {
    heading: 'Branch Operations',
    description:
      'Manage your permitted operational activities and monitor attendance and service assignments for your branch.',
    icon: ClipboardCheck,
  },

  [ROLES.ACCOUNTS]: {
    heading: 'Accounts Workspace',
    description:
      'Your account is recognized. Financial screens will appear here when their frontend workflows are implemented.',
    icon: Wallet,
  },

  [ROLES.CLEANER]: {
    heading: 'MyDay - Cleaner Workspace',
    description:
      'View your assigned services, confirm completed work, track your daily performance and compare your anonymous team ranking.',
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
    title: 'MyDay',
    description:
      'View your assigned work, completed assignments, daily summary and anonymous team ranking.',
    path: '/my-day',
    icon: ClipboardList,
  },
  {
    title: 'Monitor Assignments',
    description:
      'Review service assignments, completion status, employee allocations and correction history.',
    path: '/monitor-assignments',
    icon: ClipboardCheck,
  },
  {
    title: 'Staff Management',
    description: 'View and manage staff accounts and employee records.',
    path: '/staff',
    icon: Users,
  },
  {
    title: 'Attendance & Shifts',
    description:
      'Monitor attendance, shifts and authorized attendance actions.',
    path: '/attendance',
    icon: ClipboardCheck,
  },
  {
    title: 'Vehicle Check-in',
    description:
      'Register eligible vehicles and create service visits.',
    path: '/check-in',
    icon: CarFront,
  },
]


function getNairobiOperationalDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  const date = new Date(
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day)
    )
  )

  if (Number(values.hour) < 7) {
    date.setUTCDate(date.getUTCDate() - 1)
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}


function formatMoney(value) {
  const amount = Number(value || 0)

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}


function formatDateTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}


function formatDateLabel(value) {
  if (!value) return 'Selected operational day'

  const date = new Date(`${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-KE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}


function StatusLabel({ value }) {
  const status = String(value || 'UNKNOWN').toUpperCase()

  const styles = {
    ON_TIME: 'bg-green-100 text-green-700',
    LATE: 'bg-amber-100 text-amber-700',
    ABSENT: 'bg-red-100 text-red-700',
    NOT_CLOCKED_IN: 'bg-slate-100 text-slate-600',
    PENDING: 'bg-amber-100 text-amber-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    CHECKED_IN: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-green-100 text-green-700',
    OPEN: 'bg-blue-100 text-blue-700',
    CLOCKED_OUT: 'bg-slate-100 text-slate-600',
  }

  const label = status.replaceAll('_', ' ').toLowerCase()

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        styles[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {label}
    </span>
  )
}


function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  accent = 'red',
}) {
  const accentStyles = {
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </p>

          {description && (
            <p className="mt-1 text-xs text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            accentStyles[accent] || accentStyles.red
          }`}
        >
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}


function SectionCard({ title, description, children, action }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>

          {description && (
            <p className="mt-1 text-sm text-slate-500">
              {description}
            </p>
          )}
        </div>

        {action}
      </div>

      <div className="p-5">
        {children}
      </div>
    </section>
  )
}


function EmptyMessage({ children }) {
  return (
    <p className="py-5 text-center text-sm text-slate-500">
      {children}
    </p>
  )
}


function SupervisorDashboard() {
  const [workDate, setWorkDate] = useState(
    getNairobiOperationalDate
  )

  const [shift, setShift] = useState('ALL')

  const [workload, setWorkload] = useState(null)
  const [attendance, setAttendance] = useState(null)
  const [revenue, setRevenue] = useState(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errors, setErrors] = useState([])

  const loadDashboard = useCallback(async () => {
    setRefreshing(true)
    setErrors([])

    const filters = {
      work_date: workDate,
      shift,
    }

    const results = await Promise.allSettled([
      getSupervisorWorkload(filters),
      getSupervisorAttendance(filters),
      getSupervisorRevenue({ work_date: workDate }),
    ])

    const nextErrors = []

    if (results[0].status === 'fulfilled') {
      setWorkload(results[0].value)
    } else {
      nextErrors.push('Workload and visit information could not be loaded.')
    }

    if (results[1].status === 'fulfilled') {
      setAttendance(results[1].value)
    } else {
      nextErrors.push('Attendance information could not be loaded.')
    }

    if (results[2].status === 'fulfilled') {
      setRevenue(results[2].value)
    } else {
      nextErrors.push('Revenue information could not be loaded.')
    }

    setErrors(nextErrors)
    setLoading(false)
    setRefreshing(false)
  }, [workDate, shift])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  const branchReport = workload?.branches?.[0] || null
  const attendanceBranch = attendance?.branches?.[0] || null

  const summary = branchReport?.summary || {}
  const attendanceSummary = attendanceBranch?.summary || {}

  const visits = branchReport?.visits || []
  const unassignedServices = branchReport?.unassigned_services || []
  const employeeWorkload = branchReport?.employee_workload || []

  const attendanceRows = useMemo(() => {
    const shifts = attendanceBranch?.shifts || []

    return shifts.flatMap((shiftReport) =>
      (shiftReport.employees || []).map((employee) => ({
        ...employee,
        shift_type: shiftReport.shift_type,
      }))
    )
  }, [attendanceBranch])

  const targetPercentage = Number(
    revenue?.target_achievement_percentage || 0
  )

  const targetProgress = Math.max(
    0,
    Math.min(100, targetPercentage)
  )

  const hasTarget = Number(revenue?.daily_target || 0) > 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-red-600">
            NEV CARWASH
          </p>

          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
            Supervisor Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Branch operations overview for {formatDateLabel(workDate)}.
          </p>

          {branchReport?.branch_name && (
            <p className="mt-1 text-sm font-semibold text-slate-700">
              {branchReport.branch_name}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={loadDashboard}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="supervisor-work-date"
              className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"
            >
              <CalendarDays size={16} />
              Operational date
            </label>

            <input
              id="supervisor-work-date"
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>

          <div>
            <label
              htmlFor="supervisor-shift"
              className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"
            >
              <Clock3 size={16} />
              Shift
            </label>

            <select
              id="supervisor-shift"
              value={shift}
              onChange={(event) => setShift(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            >
              <option value="ALL">All shifts</option>
              <option value="DAY">Day shift</option>
              <option value="NIGHT">Night shift</option>
            </select>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Operational day runs from 7:00 AM to 7:00 AM the following day.
          Visit and service totals cover the full operational day.
        </p>
      </section>

      {errors.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle
              size={19}
              className="mt-0.5 shrink-0 text-amber-700"
            />

            <div>
              <p className="font-semibold text-amber-900">
                Some dashboard information is unavailable
              </p>

              <ul className="mt-1 list-inside list-disc text-sm text-amber-800">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <RefreshCw
            size={24}
            className="mx-auto animate-spin text-red-600"
          />

          <p className="mt-3 text-sm text-slate-600">
            Loading branch operations...
          </p>
        </div>
      )}

      {!loading && !branchReport && !attendanceBranch && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <AlertCircle
            size={28}
            className="mx-auto text-slate-400"
          />

          <p className="mt-3 font-semibold text-slate-800">
            Branch information is unavailable
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Check that your supervisor account has an active staff profile
            and branch assignment, then refresh.
          </p>
        </div>
      )}

      {!loading && (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">
                Operational overview
              </h2>

              <span className="text-xs text-slate-500">
                {shift === 'ALL' ? 'All shifts' : `${shift} shift`}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Total visits"
                value={summary.total_visits ?? '—'}
                description="Vehicles checked in"
                icon={CarFront}
                accent="blue"
              />

              <MetricCard
                title="Active visits"
                value={summary.active_visits ?? '—'}
                description="Checked in or in progress"
                icon={ClipboardCheck}
                accent="amber"
              />

              <MetricCard
                title="Total services"
                value={summary.total_services ?? '—'}
                description="Services recorded for visits"
                icon={ClipboardList}
                accent="slate"
              />

              <MetricCard
                title="Unassigned services"
                value={summary.unassigned_services ?? '—'}
                description="Services without an active employee assignment"
                icon={AlertCircle}
                accent="red"
              />
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="font-bold text-slate-900">
                Assignment progress
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Employee assignment counts for the selected shift.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricCard
                title="Active assignments"
                value={summary.active_assignments ?? '—'}
                icon={Users}
                accent="blue"
              />

              <MetricCard
                title="Pending assignments"
                value={summary.pending_assignments ?? '—'}
                description="Awaiting individual completion confirmation"
                icon={Clock3}
                accent="amber"
              />

              <MetricCard
                title="Completed assignments"
                value={summary.completed_assignments ?? '—'}
                description="Individually confirmed as completed"
                icon={CheckCircle2}
                accent="green"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              {canAccessRoute(
                { role: ROLES.SUPERVISOR },
                '/monitor-assignments'
              ) && (
                <Link
                  to="/monitor-assignments"
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Monitor assignments
                  <ArrowRight size={16} />
                </Link>
              )}

              <Link
                to="/attendance"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Attendance management
                <ArrowRight size={16} />
              </Link>
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="font-bold text-slate-900">
                Attendance overview
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Branch-wide attendance for the selected date and shift.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              <MetricCard
                title="Expected"
                value={attendanceSummary.total_expected ?? '—'}
                icon={Users}
                accent="slate"
              />

              <MetricCard
                title="On time"
                value={attendanceSummary.on_time ?? '—'}
                icon={CheckCircle2}
                accent="green"
              />

              <MetricCard
                title="Late"
                value={attendanceSummary.late ?? '—'}
                icon={Clock3}
                accent="amber"
              />

              <MetricCard
                title="Not clocked in"
                value={attendanceSummary.not_clocked_in ?? '—'}
                description="Still within permitted shift time"
                icon={AlertCircle}
                accent="slate"
              />

              <MetricCard
                title="Absent"
                value={attendanceSummary.absent ?? '—'}
                icon={AlertCircle}
                accent="red"
              />

              <MetricCard
                title="Working"
                value={attendanceSummary.currently_working ?? '—'}
                icon={UserRound}
                accent="blue"
              />
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="font-bold text-slate-900">
                Revenue performance
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Based on payment entries and reversals recorded during this
                operational day.
              </p>
            </div>

            {!revenue ? (
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <EmptyMessage>
                  Revenue information is not available.
                </EmptyMessage>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    title="Gross collections"
                    value={formatMoney(revenue.gross_collections)}
                    description="Before reversals"
                    icon={Wallet}
                    accent="blue"
                  />

                  <MetricCard
                    title="Total reversals"
                    value={formatMoney(revenue.total_reversals)}
                    description="Reversals processed during this day"
                    icon={AlertCircle}
                    accent="amber"
                  />

                  <MetricCard
                    title="Net collections"
                    value={formatMoney(revenue.net_collections)}
                    description="Gross collections less reversals"
                    icon={CircleDollarSign}
                    accent="green"
                  />

                  <MetricCard
                    title="Daily target"
                    value={formatMoney(revenue.daily_target)}
                    description="Configured branch revenue target"
                    icon={ClipboardCheck}
                    accent="slate"
                  />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <Banknote size={19} className="text-green-600" />
                      <h3 className="font-semibold text-slate-800">
                        Cash collections
                      </h3>
                    </div>

                    <p className="mt-3 text-xl font-bold text-slate-900">
                      {formatMoney(revenue.cash_collected)}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Net cash: {formatMoney(revenue.net_cash)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <Smartphone size={19} className="text-blue-600" />
                      <h3 className="font-semibold text-slate-800">
                        M-PESA collections
                      </h3>
                    </div>

                    <p className="mt-3 text-xl font-bold text-slate-900">
                      {formatMoney(revenue.mpesa_collected)}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Net M-PESA: {formatMoney(revenue.net_mpesa)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Daily target achievement
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {hasTarget
                          ? `${targetPercentage.toFixed(2)}% achieved`
                          : 'No daily revenue target configured'}
                      </p>
                    </div>

                    {hasTarget && (
                      <p className="text-lg font-bold text-slate-900">
                        {formatMoney(revenue.net_collections)}
                        <span className="text-sm font-normal text-slate-500">
                          {' '} / {formatMoney(revenue.daily_target)}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-red-600 transition-all"
                      style={{ width: `${targetProgress}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard
              title="Attendance register"
              description="Employees expected on the selected shift."
              action={
                <Link
                  to="/attendance"
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Open attendance
                </Link>
              }
            >
              {attendanceRows.length === 0 ? (
                <EmptyMessage>
                  No attendance rows were returned for this selection.
                </EmptyMessage>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                        <th className="pb-3 pr-3 font-semibold">Employee</th>
                        <th className="pb-3 pr-3 font-semibold">Shift</th>
                        <th className="pb-3 pr-3 font-semibold">Status</th>
                        <th className="pb-3 font-semibold">Clock in</th>
                      </tr>
                    </thead>

                    <tbody>
                      {attendanceRows.map((employee) => (
                        <tr
                          key={`${employee.staff_id}-${employee.shift_type}`}
                          className="border-b border-slate-50 last:border-0"
                        >
                          <td className="py-3 pr-3">
                            <p className="font-semibold text-slate-800">
                              {employee.employee_name || 'Unknown employee'}
                            </p>

                            <p className="text-xs text-slate-500">
                              {employee.staff_number || '—'}
                            </p>
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {employee.attendance_shift ||
                              employee.shift_type ||
                              '—'}
                          </td>

                          <td className="py-3 pr-3">
                            <StatusLabel value={employee.status} />
                          </td>

                          <td className="py-3 text-slate-600">
                            {formatDateTime(employee.clock_in)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Employee workload"
              description="Active assignments grouped by employee."
              action={
                <Link
                  to="/monitor-assignments"
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  View assignments
                </Link>
              }
            >
              {employeeWorkload.length === 0 ? (
                <EmptyMessage>
                  No employee assignments were recorded for this selection.
                </EmptyMessage>
              ) : (
                <div className="space-y-4">
                  {employeeWorkload.map((employee) => {
                    const completion = employee.assigned > 0
                      ? (employee.completed / employee.assigned) * 100
                      : 0

                    return (
                      <div key={employee.staff_id}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-slate-800">
                              {employee.staff_name}
                            </p>

                            <p className="text-xs text-slate-500">
                              {employee.staff_number}
                            </p>
                          </div>

                          <div className="text-right text-sm">
                            <p className="font-semibold text-slate-800">
                              {employee.completed}/{employee.assigned}
                            </p>

                            <p className="text-xs text-slate-500">
                              completed
                            </p>
                          </div>
                        </div>

                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{
                              width: `${Math.max(0, Math.min(100, completion))}%`,
                            }}
                          />
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          {employee.pending} pending
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Today's visits"
              description="Vehicles registered during the selected operational day."
              action={
                <Link
                  to="/check-in"
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Vehicle check-in
                </Link>
              }
            >
              {visits.length === 0 ? (
                <EmptyMessage>
                  No visits were recorded during this operational day.
                </EmptyMessage>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                        <th className="pb-3 pr-3 font-semibold">Vehicle</th>
                        <th className="pb-3 pr-3 font-semibold">Make / model</th>
                        <th className="pb-3 pr-3 font-semibold">Services</th>
                        <th className="pb-3 pr-3 font-semibold">Arrival</th>
                        <th className="pb-3 font-semibold">Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {visits.map((visit) => (
                        <tr
                          key={visit.visit_id}
                          className="border-b border-slate-50 last:border-0"
                        >
                          <td className="py-3 pr-3 font-semibold text-slate-800">
                            {visit.vehicle_registration || '—'}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {visit.vehicle_make_model || '—'}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {visit.service_count ?? 0}
                          </td>

                          <td className="py-3 pr-3 text-slate-600">
                            {formatDateTime(visit.arrival_time)}
                          </td>

                          <td className="py-3">
                            <StatusLabel value={visit.visit_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Unassigned services"
              description="Services that currently have no active employee assignment."
              action={
                <Link
                  to="/monitor-assignments"
                  className="text-sm font-semibold text-red-600 hover:text-red-700"
                >
                  Manage assignments
                </Link>
              }
            >
              {unassignedServices.length === 0 ? (
                <div className="flex items-center gap-3 py-4">
                  <CheckCircle2
                    size={22}
                    className="shrink-0 text-green-600"
                  />

                  <p className="text-sm text-slate-600">
                    All recorded services have at least one active assignment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {unassignedServices.map((service) => (
                    <div
                      key={service.visit_service_id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">
                          {service.service_name}
                        </p>

                        <p className="mt-1 text-xs text-slate-600">
                          {service.vehicle_registration || 'Vehicle not available'}
                          {' · '}
                          {service.service_category || 'Service'}
                        </p>
                      </div>

                      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        Unassigned
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}

      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
        NEV CARWASH · A Diamond Space Limited Branch
      </footer>
    </div>
  )
}


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

  if (role === ROLES.SUPERVISOR) {
    return <SupervisorDashboard />
  }

  const details = workspaceDetails[role]
  const WorkspaceIcon = details?.icon || BriefcaseBusiness

  const availableLinks = workspaceLinks
    .filter((item) => canAccessRoute(user, item.path))
    .sort((a, b) => {
      if (role !== ROLES.SUPERVISOR) return 0

      if (a.path === '/check-in') return -1
      if (b.path === '/check-in') return 1

      return 0
    })

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

            {role === ROLES.CLEANER && (
              <Link
                to="/my-day"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Open MyDay
                <ArrowRight size={16} />
              </Link>
            )}
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
                  className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-red-300 hover:shadow-md"
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-600">
                    <Icon size={22} />
                  </div>

                  <h3 className="font-semibold text-slate-900">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {item.description}
                  </p>

                  <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-red-600">
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
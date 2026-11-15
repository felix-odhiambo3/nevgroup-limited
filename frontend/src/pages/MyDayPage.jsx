
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Activity,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Wallet,
  Wrench,
  AlertTriangle,
  CarFront,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'
import {
  getMyDay,
  completeServiceAssignment,
} from '../api/visits'

function getErrorMessage(error) {
  const data = error?.response?.data

  if (typeof data?.detail === 'string') {
    return data.detail
  }

  if (data && typeof data === 'object') {
    const messages = Object.values(data)
      .flat(Infinity)
      .filter((value) => typeof value === 'string')

    if (messages.length) {
      return messages.join(' ')
    }
  }

  return error?.message || 'Something went wrong. Please try again.'
}

function formatDate(value) {
  if (!value) return 'Today'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Not available'

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}

function StatCard({ title, value, description, icon: Icon, tone }) {
  const tones = {
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">
          {title}
        </p>

        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone] || tones.blue}`}>
          <Icon size={20} />
        </div>
      </div>

      <p className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </div>
  )
}

function AssignmentStatus({ assignment }) {
  if (assignment.completed_at) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">
        <CheckCircle2 size={14} />
        Completed
      </span>
    )
  }

  if (!assignment.is_active) {
    return (
      <span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600">
        Removed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-800">
      <Clock3 size={14} />
      Pending
    </span>
  )
}

function AssignmentCard({ assignment, completing, onComplete }) {
  const isCompleted = Boolean(assignment.completed_at)
  const isRemoved = !assignment.is_active

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              {assignment.service_category?.replaceAll('_', ' ') || 'SERVICE'}
            </span>

            <AssignmentStatus assignment={assignment} />
          </div>

          <h3 className="mt-3 text-lg font-bold text-slate-900">
            {assignment.service_name}
          </h3>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CarFront size={16} />
              {assignment.vehicle_registration || 'Vehicle not available'}
            </span>

            {assignment.vehicle_make_model && (
              <span>{assignment.vehicle_make_model}</span>
            )}

            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={15} />
              Assigned {formatDateTime(assignment.assigned_at)}
            </span>
          </div>
        </div>

        {assignment.can_confirm_completion && (
          <button
            type="button"
            onClick={() => onComplete(assignment)}
            disabled={completing}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {completing ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 size={17} />
                Confirm Completed
              </>
            )}
          </button>
        )}
      </div>

      {isCompleted && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <ShieldCheck size={16} />
          Your completion was recorded at {formatDateTime(assignment.completed_at)}.
        </div>
      )}

      {isRemoved && assignment.removal_reason && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Removal note: {assignment.removal_reason}
        </p>
      )}

      {!isCompleted && !isRemoved && (
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Confirm completion only after you have finished this assigned service.
        </p>
      )}
    </article>
  )
}

function Leaderboard({ entries, myRank }) {
  const highestCount = Math.max(
    1,
    ...entries.map((entry) => entry.completed_assignments || 0)
  )

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Trophy size={20} className="text-amber-500" />
            <h2 className="text-lg font-extrabold text-slate-900">
              Today's Team Ranking
            </h2>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Branch cleaners ranked by individually confirmed completed assignments.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
          <ShieldCheck size={14} />
          Anonymous leaderboard
        </span>
      </div>

      <div className="p-5">
        {entries.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-8 text-center">
            <Trophy className="mx-auto text-slate-300" size={30} />
            <p className="mt-3 font-semibold text-slate-700">
              No team ranking yet
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Completed assignments will appear here during the day.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, index) => {
              const isMe = entry.is_current_user
              const percentage = (
                entry.completed_assignments / highestCount
              ) * 100

              return (
                <div
                  key={`${entry.label}-${index}`}
                  className={`rounded-xl border p-4 ${
                    isMe
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-100 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${
                      isMe
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {entry.rank}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className={`font-bold ${
                            isMe ? 'text-red-900' : 'text-slate-800'
                          }`}>
                            {entry.label}
                          </p>

                          {isMe && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-700">
                              Your position
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-extrabold tabular-nums text-slate-800">
                          {entry.completed_assignments}{' '}
                          <span className="font-medium text-slate-500">
                            {entry.completed_assignments === 1 ? 'task' : 'tasks'}
                          </span>
                        </p>
                      </div>

                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isMe ? 'bg-red-500' : 'bg-slate-400'
                          }`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <span>
            Your position:{' '}
            <strong className="text-slate-800">
              {myRank ? `#${myRank}` : 'Not ranked yet'}
            </strong>
          </span>

          <span>Only completion totals are shared.</span>
        </div>
      </div>
    </section>
  )
}

export default function MyDayPage() {
  const { user } = useAuth()

  const [myDay, setMyDay] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [actionMessage, setActionMessage] = useState(null)
  const [completingId, setCompletingId] = useState(null)
  const [filter, setFilter] = useState('ALL')

  const loadMyDay = useCallback(async () => {
    setLoading(true)
    setPageError('')

    try {
      const result = await getMyDay()
      setMyDay(result)
    } catch (error) {
      setPageError(getErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMyDay()
  }, [loadMyDay])

  const assignments = myDay?.assignments || []

  const filteredAssignments = useMemo(() => {
    if (filter === 'PENDING') {
      return assignments.filter(
        (item) => item.is_active && !item.completed_at
      )
    }

    if (filter === 'COMPLETED') {
      return assignments.filter(
        (item) => Boolean(item.completed_at)
      )
    }

    if (filter === 'REMOVED') {
      return assignments.filter(
        (item) => !item.is_active
      )
    }

    return assignments
  }, [assignments, filter])

  const handleComplete = async (assignment) => {
    const confirmed = window.confirm(
      `Confirm that you have completed "${assignment.service_name}" for vehicle ${assignment.vehicle_registration}?`
    )

    if (!confirmed) return

    setCompletingId(assignment.id)
    setActionMessage(null)

    try {
      const result = await completeServiceAssignment(assignment.id)

      setActionMessage({
        type: 'success',
        message: result.detail || 'Your assignment has been completed.',
      })

      await loadMyDay()
    } catch (error) {
      setActionMessage({
        type: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setCompletingId(null)
    }
  }

  const fullName = [
    user?.first_name,
    user?.last_name,
  ].filter(Boolean).join(' ') || user?.username || 'Cleaner'

  const summary = myDay?.summary || {}
  const commission = myDay?.commission || {}
  const leaderboard = myDay?.leaderboard || []

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      {/* Header */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-red-950 text-white shadow-lg">
        <div className="relative p-6 sm:p-8">
          <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full border-[35px] border-white/5" />

          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-300/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold tracking-wider text-red-200">
                <Sparkles size={14} />
                NEV CARWASH · CLEANER WORKSPACE
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
                MyDay
              </h1>

              <p className="mt-2 text-sm text-slate-300">
                Welcome, {fullName}. Make today count.
              </p>

              <p className="mt-3 flex items-center gap-2 text-sm text-slate-300">
                <MapPin size={15} />
                {myDay?.branch_name || 'Your assigned branch'}
                {myDay?.shift && (
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white">
                    {myDay.shift} SHIFT
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-white/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                  Today's date
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  {formatDate(myDay?.date)}
                </p>
              </div>

              <button
                type="button"
                onClick={loadMyDay}
                disabled={loading}
                aria-label="Refresh MyDay"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-50"
              >
                <RefreshCw
                  size={19}
                  className={loading ? 'animate-spin' : ''}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-white/10 bg-black/10 sm:grid-cols-4">
          <div className="border-r border-white/10 p-4">
            <p className="text-xs text-slate-400">Your workday</p>
            <p className="mt-1 font-bold text-white">Stay productive</p>
          </div>

          <div className="border-r border-white/10 p-4">
            <p className="text-xs text-slate-400">Performance</p>
            <p className="mt-1 font-bold text-white">Track your progress</p>
          </div>

          <div className="border-r border-white/10 p-4">
            <p className="text-xs text-slate-400">Team</p>
            <p className="mt-1 font-bold text-white">Compete fairly</p>
          </div>

          <div className="p-4">
            <p className="text-xs text-slate-400">Recognition</p>
            <p className="mt-1 font-bold text-white">Earn your rank</p>
          </div>
        </div>
      </section>

      {loading && !myDay && (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Loader2 size={32} className="mx-auto animate-spin text-red-600" />
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Loading your day...
          </p>
        </div>
      )}

      {pageError && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-5">
          <AlertTriangle size={21} className="mt-0.5 shrink-0 text-red-600" />

          <div className="min-w-0 flex-1">
            <p className="font-bold text-red-900">
              MyDay could not be loaded
            </p>

            <p className="mt-1 text-sm text-red-800">
              {pageError}
            </p>

            <button
              type="button"
              onClick={loadMyDay}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {myDay && !pageError && (
        <>
          {/* Daily analytics */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  Your Daily Performance
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Your personal work summary for today.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Assigned Today"
                value={summary.assigned_today ?? 0}
                description="Assignments given to you today"
                icon={Wrench}
                tone="blue"
              />

              <StatCard
                title="Completed Today"
                value={summary.completed_today ?? 0}
                description="Work you personally confirmed"
                icon={CheckCircle2}
                tone="green"
              />

              <StatCard
                title="Pending Work"
                value={summary.pending_assignments ?? 0}
                description="Active assignments awaiting completion"
                icon={Clock3}
                tone="amber"
              />

              <StatCard
                title="Completion Rate"
                value={
                  summary.completion_rate === null ||
                  summary.completion_rate === undefined
                    ? '—'
                    : `${summary.completion_rate}%`
                }
                description="Completed from today's assignments"
                icon={Target}
                tone="red"
              />
            </div>
          </section>

          {/* Commission */}
          <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Wallet size={24} />
                </div>

                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-amber-800">
                    Today's Commission
                  </p>

                  {commission.amount !== null &&
                  commission.amount !== undefined ? (
                    <p className="mt-1 text-3xl font-extrabold text-slate-900">
                      KES {Number(commission.amount).toLocaleString('en-KE')}
                    </p>
                  ) : (
                    <p className="mt-1 text-xl font-extrabold text-slate-900">
                      Awaiting billing integration
                    </p>
                  )}

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {commission.message ||
                      'Your commission will appear after the visit billing records are connected.'}
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-2 self-start rounded-full bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 sm:self-center">
                <Activity size={14} />
                {commission.status === 'AVAILABLE'
                  ? 'Calculated'
                  : 'Not yet calculated'}
              </span>
            </div>
          </section>

          {/* Assignments */}
          <section className="space-y-4">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">
                  My Assigned Work
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Review your assigned services and confirm each one when finished.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'ALL', label: 'All' },
                  { value: 'PENDING', label: 'Pending' },
                  { value: 'COMPLETED', label: 'Completed' },
                  { value: 'REMOVED', label: 'Removed' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      filter === item.value
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredAssignments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <Wrench size={32} className="mx-auto text-slate-300" />

                <p className="mt-3 font-bold text-slate-800">
                  No assignments in this view
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  New work assigned to you will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAssignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    completing={completingId === assignment.id}
                    onComplete={handleComplete}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Anonymous leaderboard */}
          <Leaderboard
            entries={leaderboard}
            myRank={myDay.my_rank}
          />

          {/* Work principles */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Award size={21} />
              </div>

              <div>
                <h3 className="font-bold text-slate-900">
                  How your daily ranking works
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Your ranking is based on assignments you have personally
                  confirmed as completed today. Being assigned a service
                  alone does not increase your completed-work score.
                  Other cleaners appear anonymously, and only their
                  completed assignment totals are shown.
                </p>
              </div>
            </div>
          </section>

          {actionMessage && (
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${
              actionMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}>
              {actionMessage.type === 'success' ? (
                <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" />
              ) : (
                <AlertTriangle size={20} className="mt-0.5 text-red-600" />
              )}

              <p className={`text-sm font-semibold ${
                actionMessage.type === 'success'
                  ? 'text-emerald-800'
                  : 'text-red-800'
              }`}>
                {actionMessage.message}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
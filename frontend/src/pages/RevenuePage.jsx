import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { getRevenueSummary } from '../api/payments'
import { getBranches } from '../api/branches'
import { useAuth } from '../features/auth/AuthContext'

function getOperationalDate() {
  const now = new Date()

  // The operational day starts at 7:00 AM.
  if (now.getHours() < 7) {
    now.setDate(now.getDate() - 1)
  }

  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatKES(value) {
  const amount = Number(value || 0)

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDateTime(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  accent = 'slate',
}) {
  const accents = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    red: 'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {title}
          </p>

          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
            {value}
          </p>

          {description && (
            <p className="mt-2 text-xs text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div className={`rounded-lg p-3 ${accents[accent] || accents.slate}`}>
          <Icon size={21} />
        </div>
      </div>
    </div>
  )
}

export default function RevenuePage() {
  const { user } = useAuth()

  const isSuperuser =
    user?.is_superuser === true ||
    user?.isSuperuser === true

  const [workDate, setWorkDate] = useState(getOperationalDate)
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [report, setReport] = useState(null)

  const [loadingBranches, setLoadingBranches] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSuperuser) return

    let active = true

    const loadBranches = async () => {
      setLoadingBranches(true)

      try {
        const data = await getBranches()

        if (!active) return

        setBranches(data)

        if (data.length > 0) {
          setBranchId((current) => current || String(data[0].id))
        }
      } catch (err) {
        if (active) {
          setError(
            err.response?.data?.detail ||
            'Unable to load branches. Please refresh the page.'
          )
        }
      } finally {
        if (active) setLoadingBranches(false)
      }
    }

    loadBranches()

    return () => {
      active = false
    }
  }, [isSuperuser])

  const loadReport = useCallback(async () => {
    if (isSuperuser && !branchId) {
      setReport(null)
      return
    }

    setLoadingReport(true)
    setError('')

    try {
      const params = {
        work_date: workDate,
      }

      if (isSuperuser) {
        params.branch = branchId
      }

      const data = await getRevenueSummary(params)
      setReport(data)
    } catch (err) {
      setReport(null)

      const responseData = err.response?.data
      const message =
        responseData?.detail ||
        responseData?.branch ||
        responseData?.work_date ||
        'Unable to load the revenue report. Please try again.'

      setError(
        Array.isArray(message)
          ? message.join(', ')
          : String(message)
      )
    } finally {
      setLoadingReport(false)
    }
  }, [workDate, branchId, isSuperuser])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const achievement = Number(
    report?.target_achievement_percentage
  )

  const hasTarget =
    report?.target_achievement_percentage !== null &&
    report?.target_achievement_percentage !== undefined

  const progressWidth = hasTarget
    ? Math.min(Math.max(achievement, 0), 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="text-red-600" size={25} />
            <h1 className="text-2xl font-bold text-slate-900">
              Revenue Overview
            </h1>
          </div>

          <p className="mt-1 text-sm text-slate-500">
            Daily collections, payment breakdown and revenue target performance.
          </p>
        </div>

        <button
          type="button"
          onClick={loadReport}
          disabled={loadingReport || (isSuperuser && !branchId)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            size={16}
            className={loadingReport ? 'animate-spin' : ''}
          />
          Refresh Report
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="revenue-work-date"
              className="mb-2 block text-sm font-semibold text-slate-700"
            >
              <span className="inline-flex items-center gap-2">
                <CalendarDays size={16} />
                Operational Date
              </span>
            </label>

            <input
              id="revenue-work-date"
              type="date"
              value={workDate}
              onChange={(event) => setWorkDate(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />

            <p className="mt-1 text-xs text-slate-500">
              Each operational day runs from 7:00 AM to 7:00 AM the following day.
            </p>
          </div>

          {isSuperuser && (
            <div>
              <label
                htmlFor="revenue-branch"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                Branch
              </label>

              <select
                id="revenue-branch"
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                disabled={loadingBranches || branches.length === 0}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 disabled:bg-slate-100"
              >
                <option value="">
                  {loadingBranches
                    ? 'Loading branches...'
                    : 'Select a branch'}
                </option>

                {branches.map((branch) => (
                  <option key={branch.id} value={String(branch.id)}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* Loading */}
      {loadingReport && (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-10">
          <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
            <LoaderCircle size={20} className="animate-spin text-red-600" />
            Loading revenue report...
          </div>
        </div>
      )}

      {/* Report */}
      {!loadingReport && report && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {report.branch_name}
                </h2>
                <p className="text-sm text-slate-500">
                  Branch code: {report.branch_code}
                </p>
              </div>

              <div className="text-left sm:text-right">
                <p className="text-sm font-semibold text-slate-700">
                  Report date: {report.work_date}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(report.operational_start)}
                  {' — '}
                  {formatDateTime(report.operational_end)}
                </p>
              </div>
            </div>
          </div>

          {/* Main totals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryCard
              title="Net Collections"
              value={formatKES(report.net_collections)}
              description="Collections after payment reversals"
              icon={TrendingUp}
              accent="green"
            />

            <SummaryCard
              title="Gross Collections"
              value={formatKES(report.gross_collections)}
              description="Total payments received before reversals"
              icon={Wallet}
              accent="blue"
            />

            <SummaryCard
              title="Daily Revenue Target"
              value={formatKES(report.daily_target)}
              description="Configured target for this branch"
              icon={Target}
              accent="purple"
            />
          </div>

          {/* Payment breakdown */}
          <div>
            <h2 className="mb-3 text-lg font-bold text-slate-900">
              Payment Breakdown
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Cash Collected"
                value={formatKES(report.cash_collected)}
                description={`Net cash: ${formatKES(report.net_cash)}`}
                icon={Banknote}
                accent="green"
              />

              <SummaryCard
                title="M-Pesa Collected"
                value={formatKES(report.mpesa_collected)}
                description={`Net M-Pesa: ${formatKES(report.net_mpesa)}`}
                icon={Wallet}
                accent="blue"
              />

              <SummaryCard
                title="Cash Reversed"
                value={formatKES(report.cash_reversed)}
                description="Cash payment reversals"
                icon={RefreshCw}
                accent="red"
              />

              <SummaryCard
                title="M-Pesa Reversed"
                value={formatKES(report.mpesa_reversed)}
                description="M-Pesa payment reversals"
                icon={RefreshCw}
                accent="red"
              />
            </div>
          </div>

          {/* Target performance */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-900">
                  Revenue Target Performance
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Net collections compared with the daily target.
                </p>
              </div>

              <p className="text-2xl font-bold text-slate-900">
                {hasTarget
                  ? `${achievement.toFixed(2)}%`
                  : 'Not configured'}
              </p>
            </div>

            {hasTarget ? (
              <div className="mt-5">
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>

                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>
                    Achieved: {formatKES(report.net_collections)}
                  </span>
                  <span>
                    Target: {formatKES(report.daily_target)}
                  </span>
                </div>

                {achievement >= 100 ? (
                  <p className="mt-3 text-sm font-semibold text-green-700">
                    Daily revenue target achieved.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Remaining to target:{' '}
                    <strong>
                      {formatKES(
                        Math.max(
                          Number(report.daily_target) -
                            Number(report.net_collections),
                          0
                        )
                      )}
                    </strong>
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">
                No positive daily revenue target has been configured for this branch.
              </p>
            )}
          </div>

          {/* Reversal summary */}
          <div className="rounded-xl border border-red-100 bg-red-50 p-5">
            <h2 className="font-bold text-red-900">
              Payment Reversals
            </h2>

            <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-red-800">
                Total amount reversed during this operational day
              </p>

              <p className="text-xl font-bold text-red-900">
                {formatKES(report.total_reversals)}
              </p>
            </div>
          </div>
        </>
      )}

      {!loadingReport && !report && !error && (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          {isSuperuser && !branchId
            ? 'Select a branch to view its revenue report.'
            : 'No revenue report is currently available.'}
        </div>
      )}
    </div>
  )
}
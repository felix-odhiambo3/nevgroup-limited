
import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import {
  canPerform,
  getUserRole,
  ROLES,
} from '../config/rolePermissions'

import {
  getCommissions,
  getCommissionSummary,
  getCommissionPayouts,
  createCommissionPayout,
  getCommissionAdjustments,
  createCommissionAdjustment,
} from '../api/payments'

import { getStaff } from '../api/staff'
import { getBranches } from '../api/branches'

const money = (value) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const rows = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.data)) return data.data
  return []
}

const errorMessage = (error) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (data?.detail) return data.detail
  if (data?.non_field_errors) return data.non_field_errors.join(' ')

  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => {
        const message = Array.isArray(value)
          ? value.join(', ')
          : String(value)
        return `${key}: ${message}`
      })
      .join(' | ')
  }

  return error?.message || 'Something went wrong. Please try again.'
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'

const buttonClass =
  'rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'

function SectionHeading({ title, description }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
    </div>
  )
}

function EmptyState({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      {children}
    </div>
  )
}

function Table({ columns, data, emptyMessage }) {
  if (!data.length) return <EmptyState>{emptyMessage}</EmptyState>

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="whitespace-nowrap px-4 py-3 text-left font-semibold text-slate-600"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">
          {data.map((item, index) => (
            <tr key={item.id || index} className="hover:bg-slate-50">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="whitespace-nowrap px-4 py-3 text-slate-700"
                >
                  {column.render
                    ? column.render(item)
                    : item[column.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCards({ summary }) {
  const totals = summary.reduce(
    (result, item) => ({
      earned: result.earned + Number(item.earned_commission || 0),
      adjustments: result.adjustments + Number(item.adjustments || 0),
      net: result.net + Number(item.net_earned || 0),
      paid: result.paid + Number(item.paid || 0),
      outstanding:
        result.outstanding + Number(item.outstanding_balance || 0),
    }),
    { earned: 0, adjustments: 0, net: 0, paid: 0, outstanding: 0 }
  )

  const cards = [
    ['Earned commission', totals.earned],
    ['Adjustments', totals.adjustments],
    ['Net earned', totals.net],
    ['Total paid', totals.paid],
    ['Outstanding balance', totals.outstanding],
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map(([label, amount]) => (
        <div
          key={label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-bold text-slate-900">
            {money(amount)}
          </p>
        </div>
      ))}
    </div>
  )
}

export default function CommissionManagementPage() {
  const location = useLocation()
  const { user } = useAuth()

  const role = getUserRole(user)
  const isCleaner = role === ROLES.CLEANER

  const isCommissionsPage = location.pathname === '/commissions'
  const isPayoutsPage = location.pathname === '/commission-payouts'
  const isAdjustmentsPage =
    location.pathname === '/commission-adjustments'

  const canRecordPayout = canPerform(
    user,
    'commissions.payouts.create'
  )
  const canRecordAdjustment = canPerform(
    user,
    'commissions.adjustments.create'
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [commissions, setCommissions] = useState([])
  const [summary, setSummary] = useState([])
  const [payouts, setPayouts] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])

  const [payoutForm, setPayoutForm] = useState({
    staff: '',
    branch: '',
    amount: '',
    method: 'CASH',
    reference: '',
  })

  const [adjustmentForm, setAdjustmentForm] = useState({
    commission: '',
    amount: '',
    reason: '',
  })

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (isCommissionsPage) {
        const [commissionData, summaryData] = await Promise.all([
          getCommissions(),
          getCommissionSummary(),
        ])

        setCommissions(rows(commissionData))
        setSummary(rows(summaryData))
      }

      if (isPayoutsPage) {
        const payoutRequests = [getCommissionPayouts()]

        if (canRecordPayout) {
          payoutRequests.push(getStaff(), getBranches())
        }

        const result = await Promise.all(payoutRequests)

        setPayouts(rows(result[0]))

        if (canRecordPayout) {
          setStaff(rows(result[1]).filter(
            (person) =>
              String(person.role || '').toUpperCase() === 'CLEANER'
          ))
          setBranches(rows(result[2]))
        }
      }

      if (isAdjustmentsPage) {
        const adjustmentRequests = [getCommissionAdjustments()]

        if (canRecordAdjustment) {
          adjustmentRequests.push(getCommissions())
        }

        const result = await Promise.all(adjustmentRequests)

        setAdjustments(rows(result[0]))

        if (canRecordAdjustment) {
          setCommissions(rows(result[1]))
        }
      }
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setLoading(false)
    }
  }, [
    isCommissionsPage,
    isPayoutsPage,
    isAdjustmentsPage,
    canRecordPayout,
    canRecordAdjustment,
  ])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePayoutSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (
      !payoutForm.staff ||
      !payoutForm.branch ||
      !payoutForm.amount
    ) {
      setError('Please select a cleaner, branch, and payout amount.')
      return
    }

    if (
      payoutForm.method === 'MPESA' &&
      !payoutForm.reference.trim()
    ) {
      setError('An M-Pesa transaction reference is required.')
      return
    }

    setSaving(true)

    try {
      await createCommissionPayout({
        staff: Number(payoutForm.staff),
        branch: Number(payoutForm.branch),
        amount: payoutForm.amount,
        method: payoutForm.method,
        reference: payoutForm.reference.trim(),
      })

      setPayoutForm({
        staff: '',
        branch: '',
        amount: '',
        method: 'CASH',
        reference: '',
      })

      setSuccess('Commission payout recorded successfully.')
      await loadData()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const handleAdjustmentSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (
      !adjustmentForm.commission ||
      !adjustmentForm.amount ||
      !adjustmentForm.reason.trim()
    ) {
      setError('Please complete all adjustment fields.')
      return
    }

    if (Number(adjustmentForm.amount) === 0) {
      setError('Adjustment amount cannot be zero.')
      return
    }

    setSaving(true)

    try {
      await createCommissionAdjustment({
        commission: Number(adjustmentForm.commission),
        amount: adjustmentForm.amount,
        reason: adjustmentForm.reason.trim(),
      })

      setAdjustmentForm({
        commission: '',
        amount: '',
        reason: '',
      })

      setSuccess('Commission adjustment recorded successfully.')
      await loadData()
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setSaving(false)
    }
  }

  const pageTitle = isCommissionsPage
    ? 'Cleaner Commissions'
    : isPayoutsPage
      ? 'Commission Payouts'
      : 'Commission Adjustments'

  const commissionColumns = [
    {
      key: 'staff_number',
      label: 'Staff No.',
    },
    {
      key: 'service_name',
      label: 'Service',
    },
    {
      key: 'branch_name',
      label: 'Branch',
    },
    {
      key: 'shift',
      label: 'Shift',
    },
    {
      key: 'rate_percent',
      label: 'Rate',
      render: (item) => `${item.rate_percent}%`,
    },
    {
      key: 'commission_base_amount',
      label: 'Commission base',
      render: (item) => money(item.allocated_commission_base_amount),
    },
    {
      key: 'earned_amount',
      label: 'Earned',
      render: (item) => money(item.earned_amount),
    },
    {
      key: 'adjustments_total',
      label: 'Adjustments',
      render: (item) => money(item.adjustments_total),
    },
    {
      key: 'net_earned_amount',
      label: 'Net earned',
      render: (item) => money(item.net_earned_amount),
    },
    {
      key: 'generated_at',
      label: 'Date',
      render: (item) =>
        item.generated_at
          ? new Date(item.generated_at).toLocaleString()
          : '—',
    },
  ]

  const payoutColumns = [
    { key: 'staff_number', label: 'Staff No.' },
    { key: 'branch_name', label: 'Branch' },
    {
      key: 'amount',
      label: 'Amount',
      render: (item) => money(item.amount),
    },
    {
      key: 'method_display',
      label: 'Method',
      render: (item) => item.method_display || item.method || '—',
    },
    { key: 'reference', label: 'Reference' },
    {
      key: 'paid_at',
      label: 'Paid at',
      render: (item) =>
        item.paid_at ? new Date(item.paid_at).toLocaleString() : '—',
    },
  ]

  const adjustmentColumns = [
    { key: 'staff_number', label: 'Staff No.' },
    { key: 'service_name', label: 'Service' },
    { key: 'branch_name', label: 'Branch' },
    {
      key: 'amount',
      label: 'Adjustment',
      render: (item) => money(item.amount),
    },
    { key: 'reason', label: 'Reason' },
    { key: 'adjusted_by_name', label: 'Recorded by' },
    {
      key: 'created_at',
      label: 'Date',
      render: (item) =>
        item.created_at
          ? new Date(item.created_at).toLocaleString()
          : '—',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {pageTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            NEV CARWASH staff commission records and payment tracking
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl bg-white p-10 text-center text-sm text-slate-500">
          Loading commission records...
        </div>
      ) : (
        <>
          {isCommissionsPage && (
            <>
              <SummaryCards summary={summary} />

              {isCleaner && (
                <p className="text-sm text-slate-500">
                  This page displays the commission information available
                  to your account.
                </p>
              )}

              <section className="space-y-3">
                <SectionHeading
                  title="Commission records"
                  description="Commission is generated by the backend when an eligible service assignment is completed."
                />

                <Table
                  columns={commissionColumns}
                  data={commissions}
                  emptyMessage="No commission records are available yet."
                />
              </section>

              <section className="space-y-3">
                <SectionHeading
                  title="Commission summary by cleaner"
                  description="Earned, adjusted, paid, and outstanding amounts."
                />

                <Table
                  columns={[
                    { key: 'staff_number', label: 'Staff No.' },
                    { key: 'branch_name', label: 'Branch' },
                    {
                      key: 'earned_commission',
                      label: 'Earned',
                      render: (item) => money(item.earned_commission),
                    },
                    {
                      key: 'adjustments',
                      label: 'Adjustments',
                      render: (item) => money(item.adjustments),
                    },
                    {
                      key: 'net_earned',
                      label: 'Net earned',
                      render: (item) => money(item.net_earned),
                    },
                    {
                      key: 'paid',
                      label: 'Paid',
                      render: (item) => money(item.paid),
                    },
                    {
                      key: 'outstanding_balance',
                      label: 'Outstanding',
                      render: (item) => money(item.outstanding_balance),
                    },
                  ]}
                  data={summary}
                  emptyMessage="No commission summaries are available yet."
                />
              </section>
            </>
          )}

          {isPayoutsPage && (
            <>
              {canRecordPayout && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionHeading
                    title="Record commission payout"
                    description="The backend will validate the cleaner's available commission balance."
                  />

                  <form
                    onSubmit={handlePayoutSubmit}
                    className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                  >
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Cleaner
                      <select
                        className={inputClass}
                        value={payoutForm.staff}
                        onChange={(event) =>
                          setPayoutForm({
                            ...payoutForm,
                            staff: event.target.value,
                          })
                        }
                        required
                      >
                        <option value="">Select cleaner</option>
                        {staff.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.staff_number} — {person.full_name || person.name || person.username || `Staff ${person.id}`}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Branch
                      <select
                        className={inputClass}
                        value={payoutForm.branch}
                        onChange={(event) =>
                          setPayoutForm({
                            ...payoutForm,
                            branch: event.target.value,
                          })
                        }
                        required
                      >
                        <option value="">Select branch</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Amount (KES)
                      <input
                        className={inputClass}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={payoutForm.amount}
                        onChange={(event) =>
                          setPayoutForm({
                            ...payoutForm,
                            amount: event.target.value,
                          })
                        }
                        required
                      />
                    </label>

                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Payment method
                      <select
                        className={inputClass}
                        value={payoutForm.method}
                        onChange={(event) =>
                          setPayoutForm({
                            ...payoutForm,
                            method: event.target.value,
                          })
                        }
                      >
                        <option value="CASH">Cash</option>
                        <option value="MPESA">M-Pesa</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Reference {payoutForm.method === 'MPESA' ? '(required)' : '(optional)'}
                      <input
                        className={inputClass}
                        value={payoutForm.reference}
                        onChange={(event) =>
                          setPayoutForm({
                            ...payoutForm,
                            reference: event.target.value,
                          })
                        }
                        placeholder="M-Pesa transaction code"
                        required={payoutForm.method === 'MPESA'}
                      />
                    </label>

                    <div className="flex items-end">
                      <button
                        className={buttonClass}
                        type="submit"
                        disabled={saving}
                      >
                        {saving ? 'Recording...' : 'Record payout'}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              <section className="space-y-3">
                <SectionHeading
                  title="Payout history"
                  description="Recorded commission payments."
                />

                <Table
                  columns={payoutColumns}
                  data={payouts}
                  emptyMessage="No commission payouts have been recorded."
                />
              </section>
            </>
          )}

          {isAdjustmentsPage && (
            <>
              {canRecordAdjustment && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionHeading
                    title="Record commission adjustment"
                    description="Use a positive amount to add commission or a negative amount to deduct it. Every adjustment requires a reason."
                  />

                  <form
                    onSubmit={handleAdjustmentSubmit}
                    className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                  >
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Commission record
                      <select
                        className={inputClass}
                        value={adjustmentForm.commission}
                        onChange={(event) =>
                          setAdjustmentForm({
                            ...adjustmentForm,
                            commission: event.target.value,
                          })
                        }
                        required
                      >
                        <option value="">Select commission record</option>
                        {commissions.map((item) => (
                          <option key={item.id} value={item.id}>
                            #{item.id} — {item.staff_number} — {item.service_name} — {money(item.earned_amount)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Adjustment amount (KES)
                      <input
                        className={inputClass}
                        type="number"
                        step="0.01"
                        value={adjustmentForm.amount}
                        onChange={(event) =>
                          setAdjustmentForm({
                            ...adjustmentForm,
                            amount: event.target.value,
                          })
                        }
                        placeholder="Example: 100 or -100"
                        required
                      />
                    </label>

                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      Reason
                      <input
                        className={inputClass}
                        maxLength={255}
                        value={adjustmentForm.reason}
                        onChange={(event) =>
                          setAdjustmentForm({
                            ...adjustmentForm,
                            reason: event.target.value,
                          })
                        }
                        placeholder="Explain the adjustment"
                        required
                      />
                    </label>

                    <div className="md:col-span-2 xl:col-span-3">
                      <button
                        className={buttonClass}
                        type="submit"
                        disabled={saving}
                      >
                        {saving ? 'Recording...' : 'Record adjustment'}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              <section className="space-y-3">
                <SectionHeading
                  title="Adjustment history"
                  description="Audited commission corrections."
                />

                <Table
                  columns={adjustmentColumns}
                  data={adjustments}
                  emptyMessage="No commission adjustments have been recorded."
                />
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}

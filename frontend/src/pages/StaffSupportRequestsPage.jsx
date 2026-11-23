
import { useEffect, useState } from 'react'
import {
  Wallet,
  HeartPulse,
  HandCoins,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
} from 'lucide-react'

import {
  getStaffSupportRequests,
  createStaffSupportRequest,
} from '../api/staffSupportRequests'

const REQUEST_TYPES = [
  {
    value: 'SALARY_ADVANCE',
    label: 'Salary Advance',
    description: 'Request part of your salary before payday.',
    icon: Wallet,
  },
  {
    value: 'EMERGENCY_FUNDING',
    label: 'Emergency Funding',
    description: 'Request assistance for an unexpected emergency.',
    icon: HeartPulse,
  },
  {
    value: 'SPECIAL_FINANCIAL_REQUEST',
    label: 'Special Financial Request',
    description: 'Request other financial assistance and explain your needs.',
    icon: HandCoins,
  },
]

const STATUS_STYLES = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-amber-100 text-amber-700',
  MORE_INFORMATION_REQUIRED: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  DISBURSED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-600',
}

const formatAmount = (amount) =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    maximumFractionDigits: 2,
  }).format(Number(amount || 0))

const formatStatus = (status) =>
  String(status || 'UNKNOWN')
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())

const getErrorMessage = (error) => {
  const data = error.response?.data

  if (typeof data === 'string') return data

  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, messages]) => {
        const value = Array.isArray(messages)
          ? messages.join(', ')
          : String(messages)

        return `${field}: ${value}`
      })
      .join(' | ')
  }

  return error.message || 'Something went wrong. Please try again.'
}

export default function StaffSupportRequestsPage() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [requestType, setRequestType] = useState('SALARY_ADVANCE')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

  const loadRequests = async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getStaffSupportRequests()
      setRequests(data)
    } catch (err) {
      setError(
        'Request history is not available yet. The backend integration is still being implemented.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const numericAmount = Number(amount)

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount greater than zero.')
      return
    }

    if (!reason.trim()) {
      setError('Please explain why you need financial assistance.')
      return
    }

    setSubmitting(true)

    try {
      await createStaffSupportRequest({
        request_type: requestType,
        amount_requested: numericAmount.toFixed(2),
        reason: reason.trim(),
      })

      setSuccess(
        'Your request has been submitted successfully.'
      )

      setRequestType('SALARY_ADVANCE')
      setAmount('')
      setReason('')

      await loadRequests()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-red-600">
          Employee Services
        </p>

        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          Staff Support Requests
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          Apply for financial assistance and track the progress
          of your requests.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {REQUEST_TYPES.map((type) => {
          const Icon = type.icon
          const selected = requestType === type.value

          return (
            <button
              key={type.value}
              type="button"
              onClick={() => setRequestType(type.value)}
              className={`rounded-xl border p-5 text-left transition ${
                selected
                  ? 'border-red-500 bg-red-50 ring-2 ring-red-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`rounded-lg p-3 ${
                  selected
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  <Icon size={22} />
                </div>

                {selected && (
                  <CheckCircle
                    size={20}
                    className="text-red-600"
                  />
                )}
              </div>

              <h3 className="mt-4 font-bold text-slate-900">
                {type.label}
              </h3>

              <p className="mt-2 text-sm text-slate-600">
                {type.description}
              </p>
            </button>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-3">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              New Financial Assistance Request
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Complete the details below to submit your request.
            </p>
          </div>

          {error && (
            <div className="mb-4 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 flex gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle size={18} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Request category
              </label>

              <select
                value={requestType}
                onChange={(event) => setRequestType(event.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              >
                {REQUEST_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Amount requested (KES)
              </label>

              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="e.g. 5000"
                required
                className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Explain your request
              </label>

              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why you need the assistance and provide any relevant details..."
                rows={5}
                required
                maxLength={2000}
                className="w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
              />

              <p className="mt-1 text-right text-xs text-slate-400">
                {reason.length}/2000 characters
              </p>
            </div>

            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex gap-2">
                <AlertCircle size={18} className="shrink-0" />
                <p>
                  Submission does not guarantee approval.
                  Approved requests must be formally disbursed
                  before they can become recoverable employee
                  advances.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={18} />
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                My Request History
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Track your submitted requests.
              </p>
            </div>

            <FileText className="text-slate-400" size={23} />
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading requests...
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center">
              <Clock
                size={35}
                className="mx-auto text-slate-300"
              />

              <p className="mt-3 font-semibold text-slate-700">
                No requests yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Your submitted requests will appear here.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {formatStatus(request.request_type)}
                      </p>

                      <p className="mt-1 text-sm font-bold text-slate-700">
                        {formatAmount(request.amount_requested)}
                      </p>
                    </div>

                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      STATUS_STYLES[request.status] ||
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {formatStatus(request.status)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-600">
                    {request.reason}
                  </p>

                  {request.created_at && (
                    <p className="mt-3 text-xs text-slate-400">
                      Submitted:{' '}
                      {new Date(request.created_at).toLocaleDateString('en-KE')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={loadRequests}
            disabled={loading}
            className="mt-5 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Refresh Request History
          </button>
        </section>
      </div>
    </div>
  )
}

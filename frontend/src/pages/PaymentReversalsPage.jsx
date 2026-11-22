
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowDownCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'

import {
  getPaymentCollections,
  getPaymentReversals,
  reversePayment,
} from '../api/payments'

const formatKES = (value) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatDate = (value) => {
  if (!value) return '—'

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-KE', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

const getErrorMessage = (error) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (data?.detail) return data.detail
  if (data?.amount) {
    return Array.isArray(data.amount)
      ? data.amount.join(' ')
      : data.amount
  }
  if (data?.reason) {
    return Array.isArray(data.reason)
      ? data.reason.join(' ')
      : data.reason
  }

  if (data && typeof data === 'object') {
    return Object.values(data)
      .flat()
      .filter(Boolean)
      .join(' ')
  }

  return error?.message || 'The reversal could not be recorded.'
}

function PaymentReversalsPage() {
  const [collections, setCollections] = useState([])
  const [reversals, setReversals] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const [collectionData, reversalData] = await Promise.all([
        getPaymentCollections(),
        getPaymentReversals(),
      ])

      setCollections(
        Array.isArray(collectionData)
          ? collectionData
          : collectionData?.results || [],
      )

      setReversals(
        Array.isArray(reversalData)
          ? reversalData
          : reversalData?.results || [],
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const paymentEntries = useMemo(() => {
    return collections.flatMap((collection) =>
      (collection.entries || []).map((entry) => ({
        ...entry,
        collection_id: collection.id,
        receipt_number: collection.receipt_number,
        invoice_number: collection.invoice_number,
        customer_name: collection.customer_name,
        customer_phone: collection.customer_phone,
        branch_name: collection.branch_name,
        collection_created_at: collection.created_at,
      })),
    )
  }, [collections])

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return paymentEntries

    return paymentEntries.filter((entry) => {
      const searchable = [
        entry.receipt_number,
        entry.invoice_number,
        entry.customer_name,
        entry.customer_phone,
        entry.branch_name,
        entry.method_display,
        entry.method,
        entry.reference,
        entry.id,
      ]

      return searchable.some((value) =>
        String(value || '').toLowerCase().includes(query),
      )
    })
  }, [paymentEntries, search])

  const totalReversible = paymentEntries.reduce(
    (total, entry) =>
      total + Number(entry.remaining_reversible_amount || 0),
    0,
  )

  const totalReversed = reversals.reduce(
    (total, reversal) => total + Number(reversal.amount || 0),
    0,
  )

  const openReversal = (entry) => {
    setSelectedEntry(entry)
    setAmount(String(entry.remaining_reversible_amount || ''))
    setReason('')
    setError('')
    setSuccess('')
  }

  const closeReversal = () => {
    if (submitting) return

    setSelectedEntry(null)
    setAmount('')
    setReason('')
  }

  const handleReverse = async (event) => {
    event.preventDefault()

    if (!selectedEntry) return

    const reversalAmount = Number(amount)
    const remaining = Number(
      selectedEntry.remaining_reversible_amount || 0,
    )

    if (!Number.isFinite(reversalAmount) || reversalAmount <= 0) {
      setError('Enter a valid reversal amount greater than zero.')
      return
    }

    if (reversalAmount > remaining) {
      setError(
        `The maximum amount you can reverse is ${formatKES(remaining)}.`,
      )
      return
    }

    if (!reason.trim()) {
      setError('Please provide a reason for this reversal.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await reversePayment(selectedEntry.id, {
        amount: reversalAmount.toFixed(2),
        reason: reason.trim(),
        idempotency_key: crypto.randomUUID(),
      })

      setSuccess(
        `Payment reversal of ${formatKES(reversalAmount)} recorded successfully.`,
      )
      setSelectedEntry(null)
      setAmount('')
      setReason('')

      await loadData(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Payment Reversals
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Review customer payments and record full or partial reversals.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={refreshing ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      {error && !selectedEntry && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          <CheckCircle size={18} className="mt-0.5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Payment entries</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {paymentEntries.length}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Available to reverse</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatKES(totalReversible)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total reversed</p>
          <p className="mt-2 text-2xl font-bold text-red-600">
            {formatKES(totalReversed)}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Customer payment entries
            </h2>
            <p className="text-sm text-slate-500">
              Select a payment entry to reverse all or part of its amount.
            </p>
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search receipt, customer, invoice..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading payment entries...
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="p-10 text-center">
            <ArrowDownCircle
              size={32}
              className="mx-auto text-slate-300"
            />
            <p className="mt-3 font-medium text-slate-700">
              No payment entries found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Try another search or check whether customer payments have been recorded.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt / Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Original amount</th>
                  <th className="px-4 py-3">Reversed</th>
                  <th className="px-4 py-3">Remaining</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((entry) => {
                  const remaining = Number(
                    entry.remaining_reversible_amount || 0,
                  )

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800">
                          {entry.receipt_number || '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.invoice_number || '—'}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {entry.customer_name || 'Unknown customer'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.customer_phone || entry.branch_name || '—'}
                        </p>
                      </td>

                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">
                          {entry.method_display || entry.method || '—'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.reference || 'No reference'}
                        </p>
                      </td>

                      <td className="px-4 py-3 font-medium text-slate-800">
                        {formatKES(entry.amount)}
                      </td>

                      <td className="px-4 py-3 text-red-600">
                        {formatKES(entry.reversed_amount)}
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {formatKES(remaining)}
                      </td>

                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(entry.created_at || entry.collection_created_at)}
                      </td>

                      <td className="px-4 py-3">
                        {remaining > 0 ? (
                          <button
                            type="button"
                            onClick={() => openReversal(entry)}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                          >
                            Reverse
                          </button>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                            Fully reversed
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">
            Reversal history
          </h2>
          <p className="text-sm text-slate-500">
            Recorded customer payment reversals and their audit details.
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Loading reversal history...
          </div>
        ) : reversals.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No payment reversals have been recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Payment entry</th>
                  <th className="px-4 py-3">Method / Reference</th>
                  <th className="px-4 py-3">Amount reversed</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Recorded by</th>
                  <th className="px-4 py-3">Date</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {reversals.map((reversal) => (
                  <tr key={reversal.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {reversal.receipt_number || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      #{reversal.payment_entry}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">
                        {reversal.method || '—'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {reversal.payment_reference || 'No reference'}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-semibold text-red-600">
                      {formatKES(reversal.amount)}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      {reversal.reason}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {reversal.reversed_by_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDate(reversal.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Reverse customer payment
                </h2>
                <p className="text-sm text-slate-500">
                  Receipt {selectedEntry.receipt_number || '—'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReversal}
                disabled={submitting}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close reversal form"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleReverse} className="space-y-4 p-5">
              <div className="rounded-lg bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Customer</span>
                  <span className="font-medium text-slate-800">
                    {selectedEntry.customer_name || 'Unknown customer'}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-slate-500">Payment method</span>
                  <span className="font-medium text-slate-800">
                    {selectedEntry.method_display || selectedEntry.method}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-slate-500">Original amount</span>
                  <span className="font-medium text-slate-800">
                    {formatKES(selectedEntry.amount)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between gap-3">
                  <span className="text-slate-500">Already reversed</span>
                  <span className="font-medium text-red-600">
                    {formatKES(selectedEntry.reversed_amount)}
                  </span>
                </div>
                <div className="mt-3 flex justify-between gap-3 border-t border-slate-200 pt-3">
                  <span className="font-semibold text-slate-700">
                    Maximum reversible
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatKES(selectedEntry.remaining_reversible_amount)}
                  </span>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={18} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label
                  htmlFor="reversal-amount"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Amount to reverse (KES)
                </label>
                <input
                  id="reversal-amount"
                  type="number"
                  min="0.01"
                  max={Number(selectedEntry.remaining_reversible_amount)}
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Enter the full remaining amount or a smaller amount for a partial reversal.
                </p>
              </div>

              <div>
                <label
                  htmlFor="reversal-reason"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Reason for reversal
                </label>
                <textarea
                  id="reversal-reason"
                  required
                  maxLength={255}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why this customer payment is being reversed..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
                />
                <p className="mt-1 text-right text-xs text-slate-400">
                  {reason.length}/255
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReversal}
                  disabled={submitting}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Recording reversal...' : 'Confirm reversal'}
                </button>
              </div>

              <p className="flex items-center gap-2 text-xs text-amber-700">
                <Clock size={14} />
                Reversals are financial audit records and should only be confirmed after verification.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentReversalsPage

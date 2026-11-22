
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, Wallet } from 'lucide-react'

import { getInvoices } from '../api/payments'
import MakePaymentModal from '../components/payments/MakePaymentModal'

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getInvoiceRows(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  if (Array.isArray(data?.invoices)) return data.invoices
  return []
}

function getOutstandingBalance(invoice) {
  const summary = invoice?.payment_summary || {}

  const balance =
    summary.outstanding_balance ??
    summary.outstanding_amount ??
    summary.balance_due ??
    summary.balance

  if (balance !== undefined && balance !== null) {
    return Math.max(0, Number(balance))
  }

  const paid = Number(
    summary.paid_amount ??
    summary.total_paid ??
    summary.amount_paid ??
    invoice?.paid_amount ??
    0
  )

  return Math.max(0, Number(invoice?.total_amount || 0) - paid)
}

function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function getErrorMessage(error) {
  const data = error.response?.data

  if (typeof data?.detail === 'string') return data.detail
  if (typeof data === 'string') return data

  return 'Unable to load invoices. Please try again.'
}

export default function MakePaymentPage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [paymentInvoice, setPaymentInvoice] = useState(null)

  const loadInvoices = useCallback(async () => {
    try {
      setLoading(true)
      setError('')

      const data = await getInvoices()
      setInvoices(getInvoiceRows(data))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const outstandingInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const status = String(invoice.status || '').toLowerCase()

      return (
        getOutstandingBalance(invoice) > 0 &&
        !['draft', 'void', 'credit'].includes(status)
      )
    })
  }, [invoices])

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return outstandingInvoices

    return outstandingInvoices.filter((invoice) => {
      return [
        invoice.invoice_number,
        invoice.customer_name,
        invoice.customer_phone,
        invoice.branch_name,
      ].some((value) => String(value || '').toLowerCase().includes(query))
    })
  }, [outstandingInvoices, search])

  const totalOutstanding = outstandingInvoices.reduce(
    (total, invoice) => total + getOutstandingBalance(invoice),
    0
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Make Payment
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Record cash, M-PESA, or split payments against outstanding invoices.
          </p>
        </div>

        <button
          type="button"
          onClick={loadInvoices}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={16}
            className={loading ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Invoices awaiting payment</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {outstandingInvoices.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">Total outstanding</p>
          <p className="mt-2 text-2xl font-bold text-red-600">
            {formatMoney(totalOutstanding)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoice, customer, phone, or branch..."
            className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <Wallet size={18} className="text-red-600" />
          <h2 className="font-semibold text-slate-900">
            Outstanding invoices
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-4">Invoice</th>
                <th className="px-5 py-4">Customer</th>
                <th className="px-5 py-4">Branch</th>
                <th className="px-5 py-4">Date</th>
                <th className="px-5 py-4 text-right">Invoice total</th>
                <th className="px-5 py-4 text-right">Outstanding</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-5 py-12 text-center text-slate-500">
                    Loading outstanding invoices...
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-5 py-12 text-center text-slate-500">
                    {outstandingInvoices.length === 0
                      ? 'There are no outstanding invoices.'
                      : 'No invoices match your search.'}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {invoice.invoice_number || `Invoice #${invoice.id}`}
                    </td>

                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-800">
                        {invoice.customer_name || 'Walk-in customer'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {invoice.customer_phone || 'No phone number'}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {invoice.branch_name || '—'}
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {formatDate(invoice.issued_at || invoice.created_at)}
                    </td>

                    <td className="px-5 py-4 text-right font-medium">
                      {formatMoney(invoice.total_amount)}
                    </td>

                    <td className="px-5 py-4 text-right font-bold text-red-600">
                      {formatMoney(getOutstandingBalance(invoice))}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => setPaymentInvoice(invoice)}
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        <Wallet size={14} />
                        Make Payment
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {paymentInvoice && (
        <MakePaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={async () => {
            setPaymentInvoice(null)
            await loadInvoices()
          }}
        />
      )}
    </div>
  )
}


import { useEffect, useState } from 'react'
import {
  Search,
  RefreshCw,
  Eye,
  X,
  FileText,
  Wallet,
  CheckCircle,
} from 'lucide-react'

import {
  getInvoices,
  getInvoice,
  collectInvoicePayment,
} from '../api/payments'

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function formatMoney(value) {
  return `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value) {
  if (!value) return '—'

  return new Date(value).toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
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
    0
  )

  return Math.max(
    0,
    Number(invoice?.total_amount || 0) - paid
  )
}

function getApiError(error) {
  const data = error.response?.data

  if (typeof data?.detail === 'string') {
    return data.detail
  }

  if (typeof data === 'string') {
    return data
  }

  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => {
        const message = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'string'
            ? value
            : JSON.stringify(value)

        return `${key}: ${message}`
      })
      .join(' | ')
  }

  return 'Payment could not be recorded. Please try again.'
}

// --------------------------------------------------
// STATUS BADGE
// --------------------------------------------------

function StatusBadge({ status }) {
  const normalized = String(status || 'unknown').toLowerCase()

  const styles = {
    issued: 'bg-green-100 text-green-700',
    paid: 'bg-green-100 text-green-700',
    partially_paid: 'bg-amber-100 text-amber-700',
    unpaid: 'bg-red-100 text-red-700',
    draft: 'bg-slate-100 text-slate-700',
    void: 'bg-slate-200 text-slate-700',
    credit: 'bg-blue-100 text-blue-700',
  }

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
        styles[normalized] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {String(status || 'Unknown').replaceAll('_', ' ')}
    </span>
  )
}

// --------------------------------------------------
// INVOICE DETAILS MODAL
// --------------------------------------------------

function InvoiceDetails({ invoice, onClose }) {
  if (!invoice) return null

  const lines = Array.isArray(invoice.lines) ? invoice.lines : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl">

        <div className="sticky top-0 flex items-center justify-between border-b bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Invoice {invoice.invoice_number}
            </h2>
            <p className="text-sm text-slate-500">
              {invoice.branch_name || 'Branch not specified'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close invoice details"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 p-6">

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Customer
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {invoice.customer_name || 'Walk-in customer'}
              </p>
              <p className="text-sm text-slate-500">
                {invoice.customer_phone || 'No phone number'}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Invoice status
              </p>
              <div className="mt-2">
                <StatusBadge status={invoice.status} />
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Issued
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {formatDate(invoice.issued_at || invoice.created_at)}
              </p>
            </div>
          </div>

          <div>
            <h3 className="mb-3 font-semibold text-slate-900">
              Invoice items
            </h3>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit price</th>
                    <th className="px-4 py-3 text-right">Discount</th>
                    <th className="px-4 py-3 text-right">VAT</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {line.service_name || 'Service'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {line.quantity}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(line.unit_price)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(
                          Number(line.bargaining_discount || 0) +
                          Number(line.loyalty_discount || 0)
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatMoney(line.vat_amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatMoney(line.line_total)}
                      </td>
                    </tr>
                  ))}

                  {lines.length === 0 && (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No invoice items found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ml-auto max-w-sm space-y-2 rounded-xl bg-slate-50 p-5">

            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span>{formatMoney(invoice.subtotal)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Discount</span>
              <span>{formatMoney(invoice.discount_amount)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Taxable amount</span>
              <span>{formatMoney(invoice.taxable_amount)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-600">VAT</span>
              <span>{formatMoney(invoice.vat_amount)}</span>
            </div>

            <div className="flex justify-between border-t border-slate-200 pt-3 font-bold text-slate-900">
              <span>Invoice total</span>
              <span>{formatMoney(invoice.total_amount)}</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Outstanding balance</span>
              <span className="font-semibold text-red-600">
                {formatMoney(getOutstandingBalance(invoice))}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------
// MAKE PAYMENT MODAL
// --------------------------------------------------

function MakePaymentModal({ invoice, onClose, onSuccess }) {
  const [method, setMethod] = useState('CASH')
  const [cashAmount, setCashAmount] = useState('')
  const [mpesaAmount, setMpesaAmount] = useState('')
  const [mpesaReference, setMpesaReference] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState(null)

  const outstanding = getOutstandingBalance(invoice)

  const cash = Number(cashAmount || 0)
  const mpesa = Number(mpesaAmount || 0)
  const total = cash + mpesa

  const validAmount =
    Number.isFinite(total) &&
    total > 0 &&
    total <= outstanding &&
    cash >= 0 &&
    mpesa >= 0 &&
    (method === 'CASH' ? cash > 0 && mpesa === 0 :
      method === 'MPESA' ? mpesa > 0 && cash === 0 :
        method === 'SPLIT' ? cash > 0 && mpesa > 0 : false)

  const submitPayment = async (event) => {
    event.preventDefault()
    setError('')

    if (!validAmount) {
      setError(
        'Enter a valid payment amount within the outstanding balance.'
      )
      return
    }

    if (
      (method === 'MPESA' || method === 'SPLIT') &&
      !mpesaReference.trim()
    ) {
      setError('Enter the M-PESA transaction reference.')
      return
    }

    const payments = []

    if (cash > 0) {
      payments.push({
        method: 'CASH',
        amount: cash.toFixed(2),
        reference: '',
      })
    }

    if (mpesa > 0) {
      payments.push({
        method: 'MPESA',
        amount: mpesa.toFixed(2),
        reference: mpesaReference.trim().toUpperCase(),
      })
    }

    try {
      setSaving(true)

      const result = await collectInvoicePayment(
        invoice.id,
        { payments }
      )

      setReceipt(result)
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setSaving(false)
    }
  }

  // Payment success screen
  if (receipt) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">

          <div className="mb-4 flex justify-center">
            <CheckCircle size={52} className="text-green-600" />
          </div>

          <h2 className="text-xl font-bold text-center text-slate-900">
            Payment Successful
          </h2>

          <p className="mt-2 text-center text-sm text-slate-500">
            The payment has been recorded successfully.
          </p>

          <div className="mt-6 space-y-3 rounded-xl bg-slate-50 p-4">

            <div className="flex justify-between text-sm">
              <span>Receipt number</span>
              <strong>{receipt.receipt_number || '—'}</strong>
            </div>

            <div className="flex justify-between text-sm">
              <span>Invoice</span>
              <strong>
                {receipt.invoice_number || invoice.invoice_number}
              </strong>
            </div>

            <div className="flex justify-between text-sm">
              <span>Amount received</span>
              <strong>
                {formatMoney(receipt.total_received ?? total)}
              </strong>
            </div>

            {receipt.entries?.map((entry, index) => (
              <div
                key={entry.id || index}
                className="flex justify-between text-sm"
              >
                <span>{entry.method_display || entry.method}</span>
                <span>{formatMoney(entry.amount)}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onSuccess(receipt)}
            className="mt-6 w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Payment form
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">

        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Make Payment
            </h2>
            <p className="text-sm text-slate-500">
              Invoice {invoice.invoice_number}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-slate-100"
            aria-label="Close payment modal"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={submitPayment} className="space-y-5 p-6">

          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex justify-between text-sm">
              <span>Invoice total</span>
              <strong>{formatMoney(invoice.total_amount)}</strong>
            </div>

            <div className="mt-2 flex justify-between text-lg font-bold text-red-600">
              <span>Outstanding balance</span>
              <span>{formatMoney(outstanding)}</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Payment method
            </label>

            <div className="grid grid-cols-3 gap-2">
              {[
                ['CASH', 'Cash'],
                ['MPESA', 'M-PESA'],
                ['SPLIT', 'Split'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMethod(value)
                    setCashAmount('')
                    setMpesaAmount('')
                    setError('')
                  }}
                  className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                    method === value
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {(method === 'CASH' || method === 'SPLIT') && (
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Cash amount (KES)
              </label>

              <input
                type="number"
                min="0.01"
                step="0.01"
                max={outstanding}
                required
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-red-500"
                placeholder="Enter cash amount"
              />
            </div>
          )}

          {(method === 'MPESA' || method === 'SPLIT') && (
            <>
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  M-PESA amount (KES)
                </label>

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={outstanding}
                  required
                  value={mpesaAmount}
                  onChange={(e) => setMpesaAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-red-500"
                  placeholder="Enter M-PESA amount"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold">
                  M-PESA transaction reference
                </label>

                <input
                  type="text"
                  maxLength={100}
                  required
                  value={mpesaReference}
                  onChange={(e) => setMpesaReference(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 uppercase outline-none focus:border-red-500"
                  placeholder="e.g. QWE123456"
                />
              </div>
            </>
          )}

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex justify-between font-semibold">
              <span>Total payment</span>
              <span>{formatMoney(total)}</span>
            </div>

            <div className="mt-2 flex justify-between text-sm text-slate-500">
              <span>Balance after payment</span>
              <span>
                {formatMoney(Math.max(0, outstanding - total))}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !validAmount || outstanding <= 0}
            className="w-full rounded-xl bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Recording payment...' : 'Confirm Payment'}
          </button>

        </form>
      </div>
    </div>
  )
}

// --------------------------------------------------
// MAIN INVOICE PAGE
// --------------------------------------------------

export default function InvoicePage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [paymentInvoice, setPaymentInvoice] = useState(null)

  const [detailsLoading, setDetailsLoading] = useState(false)

  // Load invoices
  const loadInvoices = async () => {
    try {
      setLoading(true)
      setError('')

      const params = {}

      if (search.trim()) {
        params.invoice_number = search.trim()
      }

      if (status) {
        params.status = status
      }

      const data = await getInvoices(params)

      setInvoices(getInvoiceRows(data))
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Unable to load invoices. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  // Open invoice details
  const openInvoice = async (invoiceId) => {
    try {
      setDetailsLoading(true)
      setError('')

      const data = await getInvoice(invoiceId)

      setSelectedInvoice(data)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Unable to load invoice details.'
      )
    } finally {
      setDetailsLoading(false)
    }
  }

  const totalValue = invoices.reduce(
    (total, invoice) =>
      total + Number(invoice.total_amount || 0),
    0
  )

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

  return (
    <div className="space-y-6">

      {/* HEADER */}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Invoice Management
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            View invoices generated from completed vehicle services.
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

      {/* SUMMARY */}

      <div className="grid gap-4 sm:grid-cols-2">

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Invoices loaded
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {invoices.length}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-500">
            Value of loaded invoices
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatMoney(totalValue)}
          </p>
        </div>

      </div>

      {/* SEARCH AND FILTER */}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            loadInvoices()
          }}
          className="flex flex-col gap-3 md:flex-row"
        >

          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice number..."
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-red-500"
          >
            <option value="">All statuses</option>
            <option value="issued">Issued</option>
            <option value="paid">Paid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="void">Void</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            Search
          </button>

        </form>
      </div>

      {/* ERROR */}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* INVOICE TABLE */}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">

        <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
          <FileText size={18} className="text-red-600" />
          <h2 className="font-semibold text-slate-900">
            Invoices
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
                <th className="px-5 py-4 text-right">Amount</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">

              {loading ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    Loading invoices...
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="px-5 py-12 text-center text-slate-500"
                  >
                    No invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => {

                  const outstanding =
                    getOutstandingBalance(invoice)

                  const canPay =
                    outstanding > 0 &&
                    !['draft', 'void', 'credit'].includes(
                      String(invoice.status || '').toLowerCase()
                    )

                  return (
                    <tr
                      key={invoice.id}
                      className="hover:bg-slate-50"
                    >

                      <td className="px-5 py-4 font-semibold text-slate-900">
                        {invoice.invoice_number}
                      </td>

                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-800">
                          {invoice.customer_name || 'Walk-in customer'}
                        </p>

                        <p className="text-xs text-slate-500">
                          {invoice.customer_phone || 'No phone'}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {invoice.branch_name || '—'}
                      </td>

                      <td className="px-5 py-4 text-slate-600">
                        {formatDate(
                          invoice.issued_at || invoice.created_at
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-semibold">
                        {formatMoney(invoice.total_amount)}
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={invoice.status} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">

                          <button
                            type="button"
                            onClick={() => openInvoice(invoice.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            <Eye size={14} />
                            View
                          </button>

                          {canPay && (
                            <button
                              type="button"
                              onClick={() => setPaymentInvoice(invoice)}
                              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
                            >
                              <Wallet size={14} />
                              Make Payment
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  )
                })
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* INVOICE DETAILS */}

      {selectedInvoice && (
        <InvoiceDetails
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}

      {/* DETAILS LOADING */}

      {detailsLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/30">
          <div className="rounded-xl bg-white px-6 py-4 font-medium text-slate-700 shadow-lg">
            Loading invoice details...
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}

      {paymentInvoice && (
        <MakePaymentModal
          invoice={paymentInvoice}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={async () => {
            setPaymentInvoice(null)
            setSelectedInvoice(null)
            await loadInvoices()
          }}
        />
      )}

    </div>
  )
}


import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  RefreshCw,
  Receipt,
  Wallet,
  CalendarDays,
  User,
  X,
  Eye,
  CreditCard,
  AlertCircle,
} from 'lucide-react'

import {
  getPaymentCollections,
  getPaymentCollection,
} from '../api/payments'

const formatMoney = (value) =>
  `KES ${Number(value || 0).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatDate = (value) => {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

const getCollectionList = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.results)) return data.results
  return []
}

function PaymentCollectionsPage() {
  const [collections, setCollections] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCollection, setSelectedCollection] = useState(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const loadCollections = async () => {
    try {
      setLoading(true)
      setError('')

      const response = await getPaymentCollections()
      setCollections(getCollectionList(response))
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Unable to load payment collections.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCollections()
  }, [])

  const filteredCollections = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return collections

    return collections.filter((item) => {
      const searchable = [
        item.receipt_number,
        item.invoice_number,
        item.customer_name,
        item.customer_phone,
        item.branch_name,
        item.received_by_name,
      ]

      return searchable.some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    })
  }, [collections, search])

  const totalCollected = useMemo(
    () =>
      collections.reduce(
        (total, item) => total + Number(item.total_received || 0),
        0
      ),
    [collections]
  )

  const openDetails = async (collection) => {
    try {
      setLoadingDetails(true)
      setError('')

      const details = await getPaymentCollection(collection.id)
      setSelectedCollection(details)
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Unable to load receipt details.'
      )
    } finally {
      setLoadingDetails(false)
    }
  }

  const closeDetails = () => {
    setSelectedCollection(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Payment Collections
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            View customer payments, receipts and collection details.
          </p>
        </div>

        <button
          onClick={loadCollections}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Collections</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {collections.length.toLocaleString('en-KE')}
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
              <Receipt size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Amount Collected</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {formatMoney(totalCollected)}
              </p>
            </div>
            <div className="rounded-xl bg-green-50 p-3 text-green-600">
              <Wallet size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">
              Collection History
            </h2>
            <p className="text-sm text-slate-500">
              Select a receipt to view its payment details.
            </p>
          </div>

          <div className="relative w-full sm:max-w-sm">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search receipt, invoice or customer..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading payment collections...
          </div>
        ) : filteredCollections.length === 0 ? (
          <div className="p-10 text-center">
            <Receipt className="mx-auto mb-3 text-slate-300" size={36} />
            <p className="font-medium text-slate-700">
              No payment collections found
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {search
                ? 'Try another search term.'
                : 'Recorded customer payments will appear here.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Amount Received</th>
                  <th className="px-4 py-3">Received By</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCollections.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-4 font-semibold text-slate-900">
                      {item.receipt_number || '—'}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.invoice_number || item.invoice || '—'}
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-slate-800">
                        {item.customer_name || 'Walk-in customer'}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.customer_phone || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.branch_name || '—'}
                    </td>
                    <td className="px-4 py-4 font-semibold text-green-700">
                      {formatMoney(item.total_received)}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {item.received_by_name || '—'}
                    </td>
                    <td className="px-4 py-4 text-slate-600">
                      {formatDate(item.created_at)}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => openDetails(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                      >
                        <Eye size={15} />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredCollections.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Showing {filteredCollections.length} of {collections.length} collections
          </div>
        )}
      </div>

      {loadingDetails && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="rounded-xl bg-white px-6 py-4 text-sm font-medium text-slate-700 shadow-xl">
            Loading receipt details...
          </div>
        </div>
      )}

      {selectedCollection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Receipt className="text-red-600" size={22} />
                  <h2 className="text-xl font-bold text-slate-900">
                    Payment Receipt
                  </h2>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedCollection.receipt_number || 'Receipt'}
                </p>
              </div>

              <button
                onClick={closeDetails}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close receipt"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Customer</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedCollection.customer_name || 'Walk-in customer'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {selectedCollection.customer_phone || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Invoice</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedCollection.invoice_number || selectedCollection.invoice || '—'}
                  </p>
                  <p className="text-sm text-slate-500">
                    {selectedCollection.branch_name || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Received By</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {selectedCollection.received_by_name || '—'}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Collection Date</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatDate(selectedCollection.created_at)}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="mb-3 font-semibold text-slate-900">
                  Payment Entries
                </h3>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Method</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Reversed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedCollection.entries || []).map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {entry.method_display || entry.method || '—'}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {entry.reference || '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {formatMoney(entry.amount)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatMoney(entry.reversed_amount)}
                          </td>
                        </tr>
                      ))}

                      {(!selectedCollection.entries ||
                        selectedCollection.entries.length === 0) && (
                        <tr>
                          <td
                            colSpan="4"
                            className="px-4 py-6 text-center text-slate-500"
                          >
                            No payment entries found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-slate-900 p-4 text-white">
                <div className="flex items-center gap-2">
                  <CreditCard size={20} />
                  <span className="font-medium">Total Received</span>
                </div>
                <span className="text-xl font-bold">
                  {formatMoney(selectedCollection.total_received)}
                </span>
              </div>

              {selectedCollection.payment_summary && (
                <div className="text-sm text-slate-600">
                  <span className="font-semibold">Payment summary: </span>
                  {typeof selectedCollection.payment_summary === 'string'
                    ? selectedCollection.payment_summary
                    : JSON.stringify(selectedCollection.payment_summary)}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={closeDetails}
                  className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PaymentCollectionsPage

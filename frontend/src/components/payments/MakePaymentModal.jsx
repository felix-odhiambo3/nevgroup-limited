
import { useState, useEffect } from 'react'
import { X, Wallet, Banknote, Smartphone, Loader2 } from 'lucide-react'
import { collectInvoicePayment } from '../../api/payments'

export default function MakePaymentModal({
  invoice,
  onClose,
  onSuccess,
}) {
  const [paymentType, setPaymentType] = useState('CASH')
  const [cashAmount, setCashAmount] = useState('')
  const [mpesaAmount, setMpesaAmount] = useState('')
  const [mpesaReference, setMpesaReference] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const summary = invoice?.payment_summary || {}

  const invoiceTotal = Number(
    summary.total_amount ?? invoice?.total_amount ?? 0
  )

  const paidAmount = Number(
    summary.paid_amount ?? 0
  )

  const balance = Number(
    summary.balance ?? Math.max(invoiceTotal - paidAmount, 0)
  )

  const [amount, setAmount] = useState(balance.toFixed(2))

  useEffect(() => {
    setAmount(balance.toFixed(2))
  }, [balance])

  const totalPayment =
    paymentType === 'SPLIT'
      ? Number(cashAmount || 0) + Number(mpesaAmount || 0)
      : Number(amount || 0)

  const remainingAfterPayment = balance - totalPayment

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (balance <= 0) {
      setError('This invoice has no outstanding balance.')
      return
    }

    if (!Number.isFinite(totalPayment) || totalPayment <= 0) {
      setError('Enter a valid payment amount.')
      return
    }

    if (totalPayment > balance) {
      setError('Payment cannot exceed the outstanding balance.')
      return
    }

    const payments =
      paymentType === 'SPLIT'
        ? [
            ...(Number(cashAmount) > 0
              ? [{
                  method: 'CASH',
                  amount: Number(cashAmount).toFixed(2),
                  reference: '',
                }]
              : []),
            ...(Number(mpesaAmount) > 0
              ? [{
                  method: 'MPESA',
                  amount: Number(mpesaAmount).toFixed(2),
                  reference: mpesaReference.trim(),
                }]
              : []),
          ]
        : [{
            method: paymentType,
            amount: Number(amount).toFixed(2),
            reference:
              paymentType === 'MPESA'
                ? mpesaReference.trim()
                : '',
          }]

    if (
      payments.some((payment) => payment.method === 'MPESA') &&
      !mpesaReference.trim()
    ) {
      setError('Enter the M-PESA transaction reference.')
      return
    }

    if (payments.length === 0) {
      setError('Enter at least one payment amount.')
      return
    }

    try {
      setLoading(true)

      const result = await collectInvoicePayment(
        invoice.id,
        {
          payments,
          idempotency_key: crypto.randomUUID(),
        }
      )

      await onSuccess?.(result)
      onClose?.()
    } catch (err) {
      const data = err.response?.data

      setError(
        data?.payments?.[0] ||
        data?.detail ||
        data?.invoice?.[0] ||
        'Unable to record payment. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between bg-red-600 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <Wallet size={24} />
            <div>
              <h2 className="text-lg font-bold">Make Payment</h2>
              <p className="text-xs text-red-100">
                Invoice {invoice.invoice_number}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-red-700"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs text-slate-500">Invoice Total</p>
              <p className="mt-1 text-lg font-bold">
                KES {invoiceTotal.toFixed(2)}
              </p>
            </div>

            <div className="rounded-xl bg-red-50 p-4">
              <p className="text-xs text-red-600">
                Outstanding Balance
              </p>
              <p className="mt-1 text-lg font-bold text-red-700">
                KES {balance.toFixed(2)}
              </p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Payment Method
            </label>

            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'CASH', label: 'Cash', Icon: Banknote },
                { value: 'MPESA', label: 'M-PESA', Icon: Smartphone },
                { value: 'SPLIT', label: 'Split', Icon: Wallet },
              ].map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentType(value)}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-semibold ${
                    paymentType === value
                      ? 'border-red-600 bg-red-50 text-red-600'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Icon size={21} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {paymentType === 'SPLIT' ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Cash Amount (KES)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  M-PESA Amount (KES)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={mpesaAmount}
                  onChange={(e) => setMpesaAmount(e.target.value)}
                  className={inputClass}
                  placeholder="0.00"
                />
              </div>

              {Number(mpesaAmount) > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    M-PESA Transaction Reference
                  </label>
                  <input
                    value={mpesaReference}
                    onChange={(e) => setMpesaReference(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. QGH1234567"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Amount (KES)
                </label>
                <input
                  type="number"
                  min="0.01"
                  max={balance}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>

              {paymentType === 'MPESA' && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    M-PESA Transaction Reference
                  </label>
                  <input
                    value={mpesaReference}
                    onChange={(e) => setMpesaReference(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. QGH1234567"
                    required
                  />
                </div>
              )}
            </>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Payment Amount</span>
              <span className="font-bold">
                KES {totalPayment.toFixed(2)}
              </span>
            </div>

            <div className="mt-2 flex justify-between text-sm">
              <span className="text-slate-500">Balance After Payment</span>
              <span className={`font-bold ${
                remainingAfterPayment < 0
                  ? 'text-red-600'
                  : 'text-green-600'
              }`}>
                KES {remainingAfterPayment.toFixed(2)}
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                loading ||
                balance <= 0 ||
                totalPayment <= 0 ||
                totalPayment > balance
              }
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Processing...
                </>
              ) : (
                'Confirm Payment'
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}

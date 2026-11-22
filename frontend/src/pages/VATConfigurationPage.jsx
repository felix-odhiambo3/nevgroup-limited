
import { useEffect, useState } from 'react'
import {
  Percent,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Building2,
  CalendarDays,
  FileText,
} from 'lucide-react'

import {
  getTaxConfigurations,
  createTaxConfiguration,
} from '../api/payments'

function formatDate(value) {
  if (!value) return '—'

  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function getErrorMessage(error) {
  const data = error.response?.data

  if (!data) {
    return 'Unable to complete the request. Please try again.'
  }

  if (typeof data.detail === 'string') {
    return data.detail
  }

  const messages = []

  Object.entries(data).forEach(([field, value]) => {
    const label = field.replaceAll('_', ' ')

    if (Array.isArray(value)) {
      messages.push(`${label}: ${value.join(' ')}`)
    } else if (typeof value === 'string') {
      messages.push(`${label}: ${value}`)
    }
  })

  return messages.join(' ') || 'Please check your entries and try again.'
}

export default function VATConfigurationPage() {
  const [branches, setBranches] = useState([])
  const [configurations, setConfigurations] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [today, setToday] = useState('')

  const [isVatRegistered, setIsVatRegistered] = useState(true)
  const [vatRate, setVatRate] = useState('')
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState('')
  const [legalBusinessName, setLegalBusinessName] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedBranch = branches.find(
    (branch) => String(branch.id) === String(selectedBranchId)
  )

  const branchConfigurations = configurations.filter(
    (item) => String(item.branch) === String(selectedBranchId)
  )

  const loadConfigurations = async () => {
    try {
      setLoading(true)
      setError('')

      const data = await getTaxConfigurations()

      const branchList = data.branches || []

      setBranches(branchList)
      setConfigurations(data.configurations || [])
      setToday(data.today || '')

      setSelectedBranchId((previous) => {
        const stillExists = branchList.some(
          (branch) => String(branch.id) === String(previous)
        )

        return stillExists
          ? previous
          : branchList.length > 0
            ? String(branchList[0].id)
            : ''
      })

      if (!effectiveFrom && data.today) {
        setEffectiveFrom(data.today)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfigurations()
  }, [])

  const handleBranchChange = (event) => {
    setSelectedBranchId(event.target.value)
    setSuccess('')
    setError('')
  }

  const handleRegistrationChange = (event) => {
    const registered = event.target.value === 'true'

    setIsVatRegistered(registered)

    if (!registered) {
      setVatRate('')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!selectedBranchId) {
      setError('Please select a branch.')
      return
    }

    if (!effectiveFrom) {
      setError('Please select an effective date.')
      return
    }

    if (isVatRegistered && vatRate.trim() === '') {
      setError('Enter the VAT rate for this branch.')
      return
    }

    const rate = isVatRegistered ? Number(vatRate) : null

    if (
      isVatRegistered &&
      (!Number.isFinite(rate) || rate < 0 || rate > 100)
    ) {
      setError('VAT rate must be between 0 and 100.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      await createTaxConfiguration({
        branch: Number(selectedBranchId),
        is_vat_registered: isVatRegistered,
        vat_rate: rate,
        tax_registration_number: taxRegistrationNumber.trim(),
        legal_business_name: legalBusinessName.trim(),
        effective_from: effectiveFrom,
      })

      setSuccess('VAT configuration saved successfully.')

      setVatRate('')
      setTaxRegistrationNumber('')
      setLegalBusinessName('')
      setIsVatRegistered(true)

      await loadConfigurations()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-gray-600">
          Loading VAT configurations...
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-3">
          <Percent className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            VAT Configuration
          </h1>
        </div>

        <p className="mt-2 text-sm text-gray-600">
          Manage branch VAT registration, tax details and effective dates.
          Previous configurations are retained for historical invoice accuracy.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {branches.length === 0 ? (
        <div className="rounded-xl border bg-white p-6 text-gray-600">
          No branches were found. Create a branch before configuring VAT.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold text-gray-900">
                Branch Selection
              </h2>
            </div>

            <label className="mb-2 block text-sm font-medium text-gray-700">
              Select Branch
            </label>

            <select
              value={selectedBranchId}
              onChange={handleBranchChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} — {branch.code}
                </option>
              ))}
            </select>

            {selectedBranch && (
              <p className="mt-2 text-sm text-gray-500">
                Town: {selectedBranch.town}
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                <h2 className="font-semibold text-gray-900">
                  New VAT Configuration
                </h2>
              </div>

              <p className="mt-1 text-sm text-gray-600">
                A new configuration will preserve the existing VAT history.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                VAT Registration Status
              </label>

              <select
                value={String(isVatRegistered)}
                onChange={handleRegistrationChange}
                className="w-full rounded-lg border border-gray-300 px-4 py-3"
              >
                <option value="true">VAT Registered</option>
                <option value="false">Not VAT Registered</option>
              </select>
            </div>

            {isVatRegistered && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  VAT Rate (%)
                </label>

                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={vatRate}
                  onChange={(event) => setVatRate(event.target.value)}
                  placeholder="e.g. 16.00"
                  required
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the applicable VAT rate for this configuration.
                </p>
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Tax Registration Number / KRA PIN
              </label>

              <input
                type="text"
                maxLength={50}
                value={taxRegistrationNumber}
                onChange={(event) =>
                  setTaxRegistrationNumber(event.target.value)
                }
                placeholder="Enter tax registration number"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Legal Business Name
              </label>

              <input
                type="text"
                maxLength={200}
                value={legalBusinessName}
                onChange={(event) =>
                  setLegalBusinessName(event.target.value)
                }
                placeholder="Enter registered business name"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <CalendarDays className="h-4 w-4" />
                Effective From
              </label>

              <input
                type="date"
                min={today}
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500"
              />

              <p className="mt-1 text-xs text-gray-500">
                Only today or a future date is allowed. Existing VAT
                configurations cannot be backdated.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !selectedBranchId}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save VAT Configuration'}
              </button>
            </div>
          </form>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
              <div>
                <h2 className="font-semibold text-gray-900">
                  VAT Configuration History
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedBranch?.name || 'Selected branch'}
                </p>
              </div>

              <button
                type="button"
                onClick={loadConfigurations}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            {branchConfigurations.length === 0 ? (
              <div className="p-6 text-sm text-gray-600">
                No VAT configurations have been recorded for this branch.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">VAT</th>
                      <th className="px-4 py-3">Rate</th>
                      <th className="px-4 py-3">Tax Number</th>
                      <th className="px-4 py-3">Effective From</th>
                      <th className="px-4 py-3">Effective Until</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {branchConfigurations.map((item) => {
                      const status = item.is_current
                        ? 'Current'
                        : item.effective_from > today
                          ? 'Scheduled'
                          : 'Historical'

                      return (
                        <tr key={item.id}>
                          <td className="whitespace-nowrap px-4 py-4">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                status === 'Current'
                                  ? 'bg-green-100 text-green-700'
                                  : status === 'Scheduled'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {status}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            {item.is_vat_registered ? 'Registered' : 'Not registered'}
                          </td>

                          <td className="px-4 py-4">
                            {item.vat_rate !== null
                              ? `${item.vat_rate}%`
                              : '—'}
                          </td>

                          <td className="px-4 py-4">
                            {item.tax_registration_number || '—'}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            {formatDate(item.effective_from)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4">
                            {formatDate(item.effective_until)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  Users,
  Search,
  RefreshCw,
  UserPlus,
  AlertCircle,
  X,
  Save,
  Eye,
  EyeOff,
  Building2,
} from 'lucide-react'

import { getStaff, registerStaff } from '../api/staff'
import { getBranches } from '../api/branches'

const getToday = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const initialForm = {
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  password: '',
  staff_number: '',
  branch: '',
  role: 'CLEANER',
  shift: 'DAY',
  phone_number: '',
  date_joined: getToday(),
}

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed'

const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

function getErrorMessage(error) {
  const data = error.response?.data

  if (!data) {
    return 'Unable to complete the request. Check your connection and try again.'
  }

  if (typeof data === 'string') return data
  if (data.detail) return data.detail

  return Object.entries(data)
    .map(([field, messages]) => {
      const message = Array.isArray(messages)
        ? messages.join(', ')
        : String(messages)

      return `${field.replaceAll('_', ' ')}: ${message}`
    })
    .join('\n')
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
    </div>
  )
}

function getStatusStyle(status) {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-50 text-green-700'
    case 'INACTIVE':
      return 'bg-slate-100 text-slate-600'
    case 'SUSPENDED':
      return 'bg-red-50 text-red-700'
    default:
      return 'bg-amber-50 text-amber-700'
  }
}

export default function StaffPage() {
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [branchesLoading, setBranchesLoading] = useState(true)

  const [error, setError] = useState('')
  const [branchError, setBranchError] = useState('')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState(initialForm)

  const loadStaff = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getStaff()
      setStaff(data)
    } catch (err) {
      const status = err.response?.status

      if (status === 401) {
        setError('Your session has expired. Please sign in again.')
      } else if (status === 403) {
        setError('You do not have permission to manage staff.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true)
    setBranchError('')

    try {
      const data = await getBranches()
      setBranches(data)
    } catch (err) {
      setBranchError(getErrorMessage(err))
    } finally {
      setBranchesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStaff()
    loadBranches()
  }, [loadStaff, loadBranches])

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return staff

    return staff.filter((member) => {
      const searchableFields = [
        member.staff_number,
        member.full_name,
        member.username,
        member.email,
        member.phone_number,
        member.branch_name,
        member.role,
        member.employment_status,
      ]

      return searchableFields.some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    })
  }, [staff, search])

  const activeCount = staff.filter(
    (member) => member.employment_status === 'ACTIVE'
  ).length

  const inactiveCount = staff.filter(
    (member) => member.employment_status === 'INACTIVE'
  ).length

  const suspendedCount = staff.filter(
    (member) => member.employment_status === 'SUSPENDED'
  ).length

  const updateField = (event) => {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const openRegistration = () => {
    setForm({
      ...initialForm,
      date_joined: getToday(),
    })

    setFormError('')
    setSuccessMessage('')
    setShowPassword(false)
    setShowModal(true)

    if (branches.length === 0) {
      loadBranches()
    }
  }

  const closeRegistration = () => {
    if (submitting) return

    setShowModal(false)
    setFormError('')
    setShowPassword(false)
  }

  const handleRegistration = async (event) => {
    event.preventDefault()

    setFormError('')
    setSuccessMessage('')

    if (!form.branch) {
      setFormError('Please select a branch.')
      return
    }

    if (form.password.length < 8) {
      setFormError('Password must contain at least 8 characters.')
      return
    }

    if (form.date_joined > getToday()) {
      setFormError('Date joined cannot be in the future.')
      return
    }

    const payload = {
      ...form,
      branch: Number(form.branch),
    }

    setSubmitting(true)

    try {
      await registerStaff(payload)

      setSuccessMessage('Staff member registered successfully.')
      setForm(initialForm)
      setShowModal(false)
      setShowPassword(false)

      await loadStaff()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-7">

      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <Users size={23} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Staff Management
            </h1>

            <p className="text-sm text-slate-500 mt-1">
              Manage NEV CARWASH employees and staff accounts.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openRegistration}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          <UserPlus size={18} />
          Register Staff
        </button>
      </div>

      {/* Success message */}
      {successMessage && (
        <div
          role="status"
          className="p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800"
        >
          {successMessage}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard label="Total Staff" value={staff.length} />
        <SummaryCard label="Active" value={activeCount} />
        <SummaryCard label="Inactive" value={inactiveCount} />
        <SummaryCard label="Suspended" value={suspendedCount} />
      </div>

      {/* Staff directory */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">

        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Staff Directory
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Employee records retrieved from the database.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search staff..."
                className={`${inputClass} sm:w-64 pl-10`}
              />
            </div>

            <button
              type="button"
              onClick={loadStaff}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={loading ? 'animate-spin' : ''}
              />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="m-5 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0" />

            <div>
              <p className="text-sm font-medium text-red-800 whitespace-pre-line">
                {error}
              </p>

              <button
                type="button"
                onClick={loadStaff}
                className="text-sm text-red-700 underline mt-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw size={25} className="animate-spin mx-auto mb-3" />
            Loading staff records...
          </div>
        ) : !error && filteredStaff.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={35} className="mx-auto text-slate-300 mb-3" />

            <p className="font-medium text-slate-700">
              {search ? 'No matching staff found.' : 'No staff records found.'}
            </p>

            <p className="text-sm text-slate-500 mt-1">
              {search
                ? 'Try another search term.'
                : 'Register your first employee to get started.'}
            </p>
          </div>
        ) : !error ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Staff Member</th>
                  <th className="px-5 py-4">Staff Number</th>
                  <th className="px-5 py-4">Branch</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Phone</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((member) => (
                  <tr key={member.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {member.full_name || member.username}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {member.email}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {member.staff_number}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {member.branch_name || 'Not assigned'}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {member.role || 'Not assigned'}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {member.phone_number || 'Not provided'}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(member.employment_status)}`}
                      >
                        {member.employment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!loading && !error && filteredStaff.length > 0 && (
          <div className="px-5 py-4 border-t border-slate-200 text-sm text-slate-500">
            Showing {filteredStaff.length} of {staff.length} staff members.
          </div>
        )}
      </section>

      {/* Staff registration modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRegistration()
            }
          }}
        >
          <div className="bg-white w-full max-w-3xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

            {/* Modal header */}
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Register New Staff
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Create an employee account and assign their branch and shift.
                </p>
              </div>

              <button
                type="button"
                onClick={closeRegistration}
                disabled={submitting}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close registration form"
              >
                <X size={21} />
              </button>
            </div>

            {/* Registration form */}
            <form
              onSubmit={handleRegistration}
              className="flex-1 overflow-y-auto"
            >
              <div className="p-6 space-y-6">

                {formError && (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3"
                  >
                    <AlertCircle className="text-red-600 shrink-0" size={20} />

                    <p className="text-sm text-red-800 whitespace-pre-line">
                      {formError}
                    </p>
                  </div>
                )}

                {/* Personal information */}
                <section>
                  <h3 className="font-semibold text-slate-900 mb-4">
                    Personal Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="first_name" className={labelClass}>
                        First Name *
                      </label>

                      <input
                        id="first_name"
                        name="first_name"
                        value={form.first_name}
                        onChange={updateField}
                        className={inputClass}
                        placeholder="First name"
                        autoComplete="given-name"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="last_name" className={labelClass}>
                        Last Name *
                      </label>

                      <input
                        id="last_name"
                        name="last_name"
                        value={form.last_name}
                        onChange={updateField}
                        className={inputClass}
                        placeholder="Last name"
                        autoComplete="family-name"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="phone_number" className={labelClass}>
                        Phone Number
                      </label>

                      <input
                        id="phone_number"
                        name="phone_number"
                        type="tel"
                        value={form.phone_number}
                        onChange={updateField}
                        className={inputClass}
                        placeholder="e.g. 0712345678"
                        autoComplete="tel"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className={labelClass}>
                        Email Address *
                      </label>

                      <input
                        id="email"
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={updateField}
                        className={inputClass}
                        placeholder="employee@example.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-100" />

                {/* Account information */}
                <section>
                  <h3 className="font-semibold text-slate-900 mb-4">
                    Account Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="username" className={labelClass}>
                        Username *
                      </label>

                      <input
                        id="username"
                        name="username"
                        value={form.username}
                        onChange={updateField}
                        className={inputClass}
                        placeholder="Unique username"
                        autoComplete="username"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="password" className={labelClass}>
                        Password *
                      </label>

                      <div className="relative">
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={form.password}
                          onChange={updateField}
                          className={`${inputClass} pr-11`}
                          placeholder="Minimum 8 characters"
                          minLength={8}
                          autoComplete="new-password"
                          required
                        />

                        <button
                          type="button"
                          onClick={() => setShowPassword((value) => !value)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="border-t border-slate-100" />

                {/* Employment information */}
                <section>
                  <h3 className="font-semibold text-slate-900 mb-4">
                    Employment Information
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="staff_number" className={labelClass}>
                        Staff Number *
                      </label>

                      <input
                        id="staff_number"
                        name="staff_number"
                        value={form.staff_number}
                        onChange={updateField}
                        className={inputClass}
                        placeholder="e.g. NEV-001"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="branch" className={labelClass}>
                        Branch *
                      </label>

                      <div className="relative">
                        <Building2
                          size={17}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <select
                          id="branch"
                          name="branch"
                          value={form.branch}
                          onChange={updateField}
                          className={`${inputClass} pl-10`}
                          required
                          disabled={branchesLoading || branches.length === 0}
                        >
                          <option value="">
                            {branchesLoading
                              ? 'Loading branches...'
                              : 'Select branch'}
                          </option>

                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name} ({branch.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      {branchError && (
                        <p className="text-xs text-red-600 mt-1">
                          {branchError}
                        </p>
                      )}

                      {!branchesLoading && branches.length === 0 && (
                        <p className="text-xs text-red-600 mt-1">
                          No active branches available.
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="role" className={labelClass}>
                        Staff Role *
                      </label>

                      <select
                        id="role"
                        name="role"
                        value={form.role}
                        onChange={updateField}
                        className={inputClass}
                        required
                      >
                        <option value="CLEANER">Cleaner</option>
                        <option value="DETAILER">Detailer</option>
                        <option value="SUPERVISOR">Supervisor</option>
                        <option value="ACCOUNTS">Accounts</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="shift" className={labelClass}>
                        Assigned Shift *
                      </label>

                      <select
                        id="shift"
                        name="shift"
                        value={form.shift}
                        onChange={updateField}
                        className={inputClass}
                        required
                      >
                        <option value="DAY">Day Shift</option>
                        <option value="NIGHT">Night Shift</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="date_joined" className={labelClass}>
                        Date Joined *
                      </label>

                      <input
                        id="date_joined"
                        type="date"
                        name="date_joined"
                        value={form.date_joined}
                        onChange={updateField}
                        max={getToday()}
                        className={inputClass}
                        required
                      />

                      <p className="text-xs text-slate-500 mt-1">
                        Future dates are not allowed.
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              {/* Modal footer */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={closeRegistration}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting || branchesLoading || branches.length === 0}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      Register Staff
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

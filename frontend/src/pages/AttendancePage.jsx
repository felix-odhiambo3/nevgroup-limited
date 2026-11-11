
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  ClipboardCheck,
  Clock,
  RefreshCw,
  Search,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  XCircle,
  History,
  ShieldCheck,
  Play,
  CalendarDays,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  getShiftInstances,
  getAttendanceOverrides,
  createAttendanceOverride,
  reviewAttendanceOverride,
  executeAttendanceOverride,
  getAttendanceOverrideAudit,
} from '../api/attendance'

import { getStaff } from '../api/staff'

const getToday = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const initialForm = {
  staff_id: '',
  shift_instance_id: '',
  action: 'CLOCK_IN',
  reason: '',
  latitude: '',
  longitude: '',
  accuracy: '',
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
  if (data.error) return data.error

  return Object.entries(data)
    .map(([field, messages]) => {
      const message = Array.isArray(messages)
        ? messages.join(', ')
        : typeof messages === 'object'
          ? JSON.stringify(messages)
          : String(messages)

      return `${field.replaceAll('_', ' ')}: ${message}`
    })
    .join('\n')
}

function formatDateTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-KE', {
    dateStyle: 'medium',
  })
}

function getStatusStyle(status) {
  switch (status) {
    case 'IN_PROGRESS':
    case 'APPROVED':
      return 'bg-green-50 text-green-700'
    case 'COMPLETED':
      return 'bg-blue-50 text-blue-700'
    case 'FINALIZED':
    case 'REJECTED':
      return 'bg-red-50 text-red-700'
    case 'PENDING':
    case 'SCHEDULED':
      return 'bg-amber-50 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(status)}`}
    >
      {(status || 'UNKNOWN').replaceAll('_', ' ')}
    </span>
  )
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{label}</p>
        {Icon && <Icon size={20} className="text-slate-400" />}
      </div>

      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
    </div>
  )
}

export default function AttendancePage() {
  const { user } = useAuth()

  const role = user?.role
  const canManage =
    user?.is_superuser ||
    ['OWNER', 'ADMIN', 'SUPERVISOR'].includes(role)

  const [shifts, setShifts] = useState([])
  const [overrides, setOverrides] = useState([])
  const [staff, setStaff] = useState([])

  const [dateFilter, setDateFilter] = useState(getToday())
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [reviewRequest, setReviewRequest] = useState(null)
  const [reviewDecision, setReviewDecision] = useState('APPROVE')
  const [reviewReason, setReviewReason] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  const [executingId, setExecutingId] = useState(null)

  const [auditRequestId, setAuditRequestId] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [shiftData, overrideData, staffData] = await Promise.all([
        getShiftInstances(
          dateFilter ? { work_date: dateFilter } : {}
        ),
        getAttendanceOverrides(
          statusFilter ? { status: statusFilter } : {}
        ),
        getStaff(),
      ])

      setShifts(shiftData)
      setOverrides(overrideData)
      setStaff(staffData)
    } catch (err) {
      const status = err.response?.status

      if (status === 401) {
        setError('Your session has expired. Please sign in again.')
      } else if (status === 403) {
        setError('Your account does not have permission to view attendance management.')
      } else {
        setError(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }, [dateFilter, statusFilter])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeStaff = useMemo(
    () =>
      staff.filter(
        (member) => member.employment_status === 'ACTIVE'
      ),
    [staff]
  )

  const filteredOverrides = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return overrides

    return overrides.filter((item) => {
      const fields = [
        item.staff_full_name,
        item.staff_username,
        item.staff_number,
        item.branch_name,
        item.action,
        item.status,
        item.requested_by_username,
      ]

      return fields.some((value) =>
        String(value || '').toLowerCase().includes(term)
      )
    })
  }, [overrides, search])

  const pendingCount = overrides.filter(
    (item) => item.status === 'PENDING'
  ).length

  const approvedCount = overrides.filter(
    (item) => item.status === 'APPROVED'
  ).length

  const executedCount = overrides.filter(
    (item) => item.is_executed
  ).length

  const updateForm = (event) => {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  const openCreateModal = () => {
    setForm(initialForm)
    setFormError('')
    setShowCreateModal(true)
    setSuccessMessage('')
  }

  const closeCreateModal = () => {
    if (submitting) return

    setShowCreateModal(false)
    setFormError('')
  }

  const handleCreate = async (event) => {
    event.preventDefault()
    setFormError('')
    setSuccessMessage('')

    if (!form.staff_id || !form.shift_instance_id) {
      setFormError('Please select an employee and shift.')
      return
    }

    if (!form.reason.trim()) {
      setFormError('Please provide a reason for this request.')
      return
    }

    const gpsValues = [
      form.latitude,
      form.longitude,
      form.accuracy,
    ]

    const hasSomeGps = gpsValues.some(
      (value) => value.trim() !== ''
    )

    const hasAllGps = gpsValues.every(
      (value) => value.trim() !== ''
    )

    if (hasSomeGps && !hasAllGps) {
      setFormError(
        'If providing GPS information, enter latitude, longitude, and accuracy together.'
      )
      return
    }

    const payload = {
      staff_id: Number(form.staff_id),
      shift_instance_id: Number(form.shift_instance_id),
      action: form.action,
      reason: form.reason.trim(),
    }

    if (hasAllGps) {
      const latitude = Number(form.latitude)
      const longitude = Number(form.longitude)
      const accuracy = Number(form.accuracy)

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !Number.isFinite(accuracy)
      ) {
        setFormError('GPS values must be valid numbers.')
        return
      }

      if (latitude < -90 || latitude > 90) {
        setFormError('Latitude must be between -90 and 90.')
        return
      }

      if (longitude < -180 || longitude > 180) {
        setFormError('Longitude must be between -180 and 180.')
        return
      }

      if (accuracy < 0) {
        setFormError('GPS accuracy cannot be negative.')
        return
      }

      payload.latitude = latitude
      payload.longitude = longitude
      payload.accuracy = accuracy
    }

    setSubmitting(true)

    try {
      await createAttendanceOverride(payload)

      setShowCreateModal(false)
      setForm(initialForm)
      setSuccessMessage(
        'Attendance override request created successfully.'
      )

      await loadData()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const openReviewModal = (item, decision) => {
    setReviewRequest(item)
    setReviewDecision(decision)
    setReviewReason('')
    setReviewError('')
    setSuccessMessage('')
  }

  const closeReviewModal = () => {
    if (reviewSubmitting) return

    setReviewRequest(null)
    setReviewReason('')
    setReviewError('')
  }

  const handleReview = async (event) => {
    event.preventDefault()
    setReviewError('')

    if (!reviewReason.trim()) {
      setReviewError('A review reason is required.')
      return
    }

    setReviewSubmitting(true)

    try {
      await reviewAttendanceOverride(
        reviewRequest.id,
        {
          decision: reviewDecision,
          reason: reviewReason.trim(),
        }
      )

      setReviewRequest(null)
      setSuccessMessage(
        `Request ${reviewDecision.toLowerCase()}d successfully.`
      )

      await loadData()
    } catch (err) {
      setReviewError(getErrorMessage(err))
    } finally {
      setReviewSubmitting(false)
    }
  }

  const handleExecute = async (item) => {
    const confirmed = window.confirm(
      `Execute the approved ${item.action.replace('_', ' ')} request for ${item.staff_full_name || item.staff_username}?`
    )

    if (!confirmed) return

    setExecutingId(item.id)
    setError('')
    setSuccessMessage('')

    try {
      const result = await executeAttendanceOverride(item.id)

      setSuccessMessage(
        `Attendance action executed successfully. Attendance record #${result.attendance_id} created.`
      )

      await loadData()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setExecutingId(null)
    }
  }

  const toggleAudit = async (requestId) => {
    if (auditRequestId === requestId) {
      setAuditRequestId(null)
      setAuditLogs([])
      setAuditError('')
      return
    }

    setAuditRequestId(requestId)
    setAuditLogs([])
    setAuditError('')
    setAuditLoading(true)

    try {
      const data = await getAttendanceOverrideAudit(requestId)
      setAuditLogs(data)
    } catch (err) {
      setAuditError(getErrorMessage(err))
    } finally {
      setAuditLoading(false)
    }
  }

  const isOwnRequest = (item) =>
    String(item.requested_by) === String(user?.id)

  const canReview = (item) =>
    item.status === 'PENDING' && !isOwnRequest(item)

  const canExecute = (item) =>
    item.status === 'APPROVED' &&
    !item.is_executed &&
    String(item.reviewed_by) === String(user?.id)

  if (!canManage) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <ShieldCheck
          size={38}
          className="mx-auto text-slate-300 mb-3"
        />

        <h2 className="font-semibold text-slate-900">
          Access restricted
        </h2>

        <p className="text-sm text-slate-500 mt-2">
          Your account does not have permission to manage attendance.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-7">

      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <ClipboardCheck size={23} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Attendance & Shifts
            </h1>

            <p className="text-sm text-slate-500 mt-1">
              Monitor shifts and manage supervisor-assisted attendance.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={loading ? 'animate-spin' : ''}
            />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
          >
            <Plus size={18} />
            New Override Request
          </button>
        </div>
      </div>

      {/* Feedback */}
      {successMessage && (
        <div
          role="status"
          className="p-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800 flex items-start gap-2"
        >
          <CheckCircle2 size={19} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3"
        >
          <AlertCircle size={20} className="text-red-600 shrink-0" />

          <div>
            <p className="text-sm text-red-800 whitespace-pre-line">
              {error}
            </p>

            <button
              type="button"
              onClick={loadData}
              className="text-sm text-red-700 underline mt-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="Shifts on Selected Date"
          value={shifts.length}
          icon={CalendarDays}
        />

        <SummaryCard
          label="Pending Requests"
          value={pendingCount}
          icon={Clock}
        />

        <SummaryCard
          label="Approved Requests"
          value={approvedCount}
          icon={CheckCircle2}
        />

        <SummaryCard
          label="Executed Requests"
          value={executedCount}
          icon={ShieldCheck}
        />
      </div>

      {/* Shift overview */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              Shift Overview
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Shift instances accessible to your account.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <CalendarDays size={17} className="text-slate-400" />

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className={`${inputClass} sm:w-44`}
              aria-label="Filter shifts by date"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500">
            <RefreshCw
              size={23}
              className="animate-spin mx-auto mb-2"
            />
            Loading shifts...
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarDays
              size={32}
              className="mx-auto text-slate-300 mb-3"
            />

            <p className="font-medium text-slate-700">
              No shifts found for this date.
            </p>

            <p className="text-sm text-slate-500 mt-1">
              Select another date to view its shift instances.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Branch</th>
                  <th className="px-5 py-4">Shift</th>
                  <th className="px-5 py-4">Work Date</th>
                  <th className="px-5 py-4">Scheduled Start</th>
                  <th className="px-5 py-4">Scheduled End</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">
                      {shift.branch_name}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {shift.shift_type}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {formatDate(shift.work_date)}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap">
                      {formatDateTime(shift.scheduled_start)}
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap">
                      {formatDateTime(shift.scheduled_end)}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={shift.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Override requests */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">
              Attendance Override Requests
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Review, approve, execute, and inspect assisted attendance actions.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search employee, staff number, branch..."
                className={`${inputClass} pl-10`}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`${inputClass} md:w-48`}
              aria-label="Filter override requests by status"
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-slate-500">
            <RefreshCw
              size={24}
              className="animate-spin mx-auto mb-3"
            />
            Loading attendance requests...
          </div>
        ) : filteredOverrides.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardCheck
              size={35}
              className="mx-auto text-slate-300 mb-3"
            />

            <p className="font-medium text-slate-700">
              No attendance requests found.
            </p>

            <p className="text-sm text-slate-500 mt-1">
              Try changing the filters or create a new override request.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4">Employee</th>
                  <th className="px-5 py-4">Action</th>
                  <th className="px-5 py-4">Shift</th>
                  <th className="px-5 py-4">Requested By</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Execution</th>
                  <th className="px-5 py-4">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredOverrides.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 align-top">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {item.staff_full_name || item.staff_username}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {item.staff_number || item.staff_username}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {item.branch_name}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700 whitespace-nowrap">
                      {item.action?.replace('_', ' ')}
                    </td>

                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-700">
                        {item.shift_type} #{item.shift_instance}
                      </p>

                      <p className="text-xs text-slate-500 mt-1">
                        {formatDate(item.work_date)}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-sm text-slate-700">
                      {item.requested_by_username || '—'}
                    </td>

                    <td className="px-5 py-4">
                      <StatusBadge status={item.status} />

                      {item.reviewed_by_username && (
                        <p className="text-xs text-slate-500 mt-2">
                          Reviewed by {item.reviewed_by_username}
                        </p>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      {item.is_executed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                          <CheckCircle2 size={15} />
                          Executed
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          Not executed
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-2 min-w-32">
                        {canReview(item) && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                openReviewModal(item, 'APPROVE')
                              }
                              className="text-xs font-semibold text-green-700 hover:text-green-900 flex items-center gap-1"
                            >
                              <CheckCircle2 size={15} />
                              Approve
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                openReviewModal(item, 'REJECT')
                              }
                              className="text-xs font-semibold text-red-700 hover:text-red-900 flex items-center gap-1"
                            >
                              <XCircle size={15} />
                              Reject
                            </button>
                          </>
                        )}

                        {item.status === 'PENDING' && isOwnRequest(item) && (
                          <span className="text-xs text-amber-700">
                            Cannot review own request
                          </span>
                        )}

                        {canExecute(item) && (
                          <button
                            type="button"
                            onClick={() => handleExecute(item)}
                            disabled={executingId === item.id}
                            className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1 disabled:opacity-50"
                          >
                            {executingId === item.id ? (
                              <RefreshCw size={15} className="animate-spin" />
                            ) : (
                              <Play size={15} />
                            )}
                            Execute
                          </button>
                        )}

                        {item.status === 'APPROVED' &&
                          !item.is_executed &&
                          !canExecute(item) && (
                            <span className="text-xs text-slate-500">
                              Reviewer must execute
                            </span>
                          )}

                        <button
                          type="button"
                          onClick={() => toggleAudit(item.id)}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                        >
                          <History size={15} />
                          {auditRequestId === item.id
                            ? 'Hide audit'
                            : 'Audit history'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Audit history */}
        {auditRequestId !== null && (
          <div className="p-5 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Audit History — Request #{auditRequestId}
                </h3>

                <p className="text-xs text-slate-500 mt-1">
                  Recorded attendance events and actions.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setAuditRequestId(null)
                  setAuditLogs([])
                  setAuditError('')
                }}
                className="p-2 rounded-lg hover:bg-slate-200 text-slate-500"
                aria-label="Close audit history"
              >
                <X size={18} />
              </button>
            </div>

            {auditLoading ? (
              <div className="py-6 text-center text-slate-500 text-sm">
                <RefreshCw
                  size={20}
                  className="animate-spin mx-auto mb-2"
                />
                Loading audit history...
              </div>
            ) : auditError ? (
              <p className="text-sm text-red-700 whitespace-pre-line">
                {auditError}
              </p>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm text-slate-500">
                No audit events found for this request.
              </p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-white border border-slate-200 rounded-lg p-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">
                        {log.action?.replaceAll('_', ' ')}
                      </p>

                      <p className="text-xs text-slate-500">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>

                    <p className="text-sm text-slate-600 mt-2">
                      Actor: {log.actor_username || 'System'}
                    </p>

                    {log.reason && (
                      <p className="text-sm text-slate-600 mt-1">
                        Reason: {log.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Create override modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-2xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">

            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  New Attendance Override
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Record a supervisor-assisted clock-in or clock-out request.
                </p>
              </div>

              <button
                type="button"
                onClick={closeCreateModal}
                disabled={submitting}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close override form"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-5">

                {formError && (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-red-50 border border-red-200 flex gap-3"
                  >
                    <AlertCircle
                      className="text-red-600 shrink-0"
                      size={20}
                    />

                    <p className="text-sm text-red-800 whitespace-pre-line">
                      {formError}
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="staff_id" className={labelClass}>
                    Employee *
                  </label>

                  <select
                    id="staff_id"
                    name="staff_id"
                    value={form.staff_id}
                    onChange={updateForm}
                    className={inputClass}
                    required
                  >
                    <option value="">Select active employee</option>

                    {activeStaff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name || member.username}
                        {' — '}
                        {member.staff_number}
                        {' — '}
                        {member.branch_name}
                      </option>
                    ))}
                  </select>

                  <p className="text-xs text-slate-500 mt-1">
                    Only active staff members are available.
                  </p>

                  {activeStaff.length === 0 && (
                    <p className="text-xs text-red-600 mt-1">
                      No active staff records were found.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="shift_instance_id" className={labelClass}>
                    Shift Instance *
                  </label>

                  <select
                    id="shift_instance_id"
                    name="shift_instance_id"
                    value={form.shift_instance_id}
                    onChange={updateForm}
                    className={inputClass}
                    required
                  >
                    <option value="">Select shift</option>

                    {shifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shift.branch_name}
                        {' — '}
                        {shift.shift_type}
                        {' — '}
                        {formatDate(shift.work_date)}
                        {' — '}
                        {shift.status}
                      </option>
                    ))}
                  </select>

                  <p className="text-xs text-slate-500 mt-1">
                    Shifts are loaded using the selected date above.
                  </p>
                </div>

                <div>
                  <label htmlFor="action" className={labelClass}>
                    Attendance Action *
                  </label>

                  <select
                    id="action"
                    name="action"
                    value={form.action}
                    onChange={updateForm}
                    className={inputClass}
                    required
                  >
                    <option value="CLOCK_IN">Clock In</option>
                    <option value="CLOCK_OUT">Clock Out</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="reason" className={labelClass}>
                    Reason for Override *
                  </label>

                  <textarea
                    id="reason"
                    name="reason"
                    value={form.reason}
                    onChange={updateForm}
                    className={inputClass}
                    rows={4}
                    maxLength={2000}
                    placeholder="Explain why assisted attendance is required..."
                    required
                  />

                  <p className="text-xs text-slate-500 mt-1">
                    Maximum 2,000 characters.
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-5">
                  <h3 className="font-semibold text-slate-900">
                    Optional GPS Information
                  </h3>

                  <p className="text-xs text-slate-500 mt-1 mb-4">
                    Leave all three fields empty if GPS information is unavailable.
                    If supplied, all three values are required.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label htmlFor="latitude" className={labelClass}>
                        Latitude
                      </label>

                      <input
                        id="latitude"
                        name="latitude"
                        type="number"
                        step="any"
                        value={form.latitude}
                        onChange={updateForm}
                        className={inputClass}
                        placeholder="-1.2469"
                      />
                    </div>

                    <div>
                      <label htmlFor="longitude" className={labelClass}>
                        Longitude
                      </label>

                      <input
                        id="longitude"
                        name="longitude"
                        type="number"
                        step="any"
                        value={form.longitude}
                        onChange={updateForm}
                        className={inputClass}
                        placeholder="36.6607"
                      />
                    </div>

                    <div>
                      <label htmlFor="accuracy" className={labelClass}>
                        Accuracy (metres)
                      </label>

                      <input
                        id="accuracy"
                        name="accuracy"
                        type="number"
                        min="0"
                        step="any"
                        value={form.accuracy}
                        onChange={updateForm}
                        className={inputClass}
                        placeholder="10"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting || activeStaff.length === 0 || shifts.length === 0}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Plus size={17} />
                      Create Request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewRequest && (
        <div className="fixed inset-0 z-[110] bg-slate-950/60 flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">

            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {reviewDecision === 'APPROVE'
                    ? 'Approve Request'
                    : 'Reject Request'}
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Request #{reviewRequest.id} —{' '}
                  {reviewRequest.staff_full_name || reviewRequest.staff_username}
                </p>
              </div>

              <button
                type="button"
                onClick={closeReviewModal}
                disabled={reviewSubmitting}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close review form"
              >
                <X size={21} />
              </button>
            </div>

            <form onSubmit={handleReview}>
              <div className="p-6 space-y-4">

                {reviewError && (
                  <div
                    role="alert"
                    className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 whitespace-pre-line"
                  >
                    {reviewError}
                  </div>
                )}

                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-slate-700">
                    <strong>Action:</strong>{' '}
                    {reviewRequest.action?.replace('_', ' ')}
                  </p>

                  <p className="text-sm text-slate-700">
                    <strong>Employee reason:</strong>{' '}
                    {reviewRequest.employee_reason}
                  </p>

                  <p className="text-sm text-slate-700">
                    <strong>Requested by:</strong>{' '}
                    {reviewRequest.requested_by_username}
                  </p>
                </div>

                <div>
                  <label htmlFor="reviewDecision" className={labelClass}>
                    Decision *
                  </label>

                  <select
                    id="reviewDecision"
                    value={reviewDecision}
                    onChange={(event) => setReviewDecision(event.target.value)}
                    className={inputClass}
                    disabled={reviewSubmitting}
                  >
                    <option value="APPROVE">Approve</option>
                    <option value="REJECT">Reject</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="reviewReason" className={labelClass}>
                    Review Reason *
                  </label>

                  <textarea
                    id="reviewReason"
                    value={reviewReason}
                    onChange={(event) => setReviewReason(event.target.value)}
                    className={inputClass}
                    rows={4}
                    maxLength={2000}
                    placeholder="Explain your decision..."
                    required
                    disabled={reviewSubmitting}
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  type="button"
                  onClick={closeReviewModal}
                  disabled={reviewSubmitting}
                  className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={reviewSubmitting || !reviewReason.trim()}
                  className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${
                    reviewDecision === 'APPROVE'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {reviewSubmitting ? (
                    <>
                      <RefreshCw size={17} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      {reviewDecision === 'APPROVE' ? (
                        <CheckCircle2 size={17} />
                      ) : (
                        <XCircle size={17} />
                      )}
                      Confirm {reviewDecision === 'APPROVE' ? 'Approval' : 'Rejection'}
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

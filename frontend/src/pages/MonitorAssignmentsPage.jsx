
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  UserCheck,
  UserPlus,
  UserMinus,
  X,
  Clock3,
  CarFront,
  CalendarDays,
  History,
} from 'lucide-react'

import {
  getSupervisorAssignments,
  reassignSupervisorAssignment,
  completeSupervisorAssignment,
  removeSupervisorAssignment,
} from '../api/visits'

import { getBranchStaff } from '../api/staffOperations'

const getErrorMessage = (error) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (data?.detail) return data.detail

  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, messages]) => {
        const message = Array.isArray(messages)
          ? messages.join(' ')
          : typeof messages === 'object'
            ? JSON.stringify(messages)
            : String(messages)

        return `${field}: ${message}`
      })
      .join(' ')
  }

  return error?.message || 'Something went wrong. Please try again.'
}

const formatDateTime = (value) => {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const formatKES = (value) => {
  const amount = Number(value)

  if (!Number.isFinite(amount)) return 'KES 0.00'

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const getExpectedRole = (category) => {
  if (category === 'CAR_WASH') return 'CLEANER'
  if (category === 'DETAILING') return 'DETAILER'
  return null
}

const getStaffName = (staff) =>
  staff.full_name ||
  staff.username ||
  staff.staff_number ||
  `Staff member #${staff.id}`

const getAssignmentStatus = (assignment) => {
  if (!assignment.is_active) return 'REMOVED'
  if (assignment.completed_at || assignment.is_completed) return 'COMPLETED'
  return 'ACTIVE'
}

const statusStyles = {
  ACTIVE: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REMOVED: 'bg-slate-200 text-slate-700',
}

function StatusBadge({ status }) {
  const labels = {
    ACTIVE: 'In progress',
    COMPLETED: 'Completed',
    REMOVED: 'Removed',
  }

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        statusStyles[status] || 'bg-slate-100 text-slate-700'
      }`}
    >
      {labels[status] || status}
    </span>
  )
}

function SummaryCard({ label, value, icon: Icon, description }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{description}</p>
        </div>

        <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
          <Icon size={20} />
        </div>
      </div>
    </div>
  )
}

function ReassignPanel({
  assignment,
  staff,
  loadingStaff,
  saving,
  selectedStaffId,
  reason,
  onStaffChange,
  onReasonChange,
  onCancel,
  onSubmit,
}) {
  const expectedRole = getExpectedRole(assignment.service_category)

  const eligibleStaff = staff.filter(
    (member) =>
      member.role === expectedRole &&
      Number(member.id) !== Number(assignment.staff)
  )

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-slate-900">
            Reassign service
          </h4>
          <p className="mt-1 text-sm text-slate-600">
            Select a replacement employee for {assignment.service_name}.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800"
          aria-label="Close reassignment panel"
        >
          <X size={18} />
        </button>
      </div>

      {loadingStaff ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
          <Loader2 size={16} className="animate-spin" />
          Loading eligible employees...
        </div>
      ) : eligibleStaff.length === 0 ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          No other active {expectedRole === 'CLEANER' ? 'cleaners' : 'detailers'}
          {' '}are available in your branch for this service.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Replacement employee *
            </label>

            <select
              value={selectedStaffId}
              onChange={(event) => onStaffChange(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="">Select replacement employee</option>

              {eligibleStaff.map((member) => (
                <option key={member.id} value={member.id}>
                  {getStaffName(member)}
                  {member.staff_number ? ` (${member.staff_number})` : ''}
                  {member.current_shift ? ` — ${member.current_shift}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Reason for reassignment *
            </label>

            <textarea
              rows={2}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explain why this employee is being replaced."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSubmit}
              disabled={saving || !selectedStaffId || reason.trim().length < 3}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="mr-2 animate-spin" />
                  Reassigning...
                </>
              ) : (
                <>
                  <UserPlus size={15} className="mr-2" />
                  Confirm reassignment
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignmentCard({
  assignment,
  onComplete,
  onRemove,
  onOpenReassign,
  actionBusy,
}) {
  const currentStatus = getAssignmentStatus(assignment)
  const canManage = currentStatus === 'ACTIVE'

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700">
            <ClipboardList size={20} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-slate-900">
                {assignment.service_name}
              </h3>

              <StatusBadge status={currentStatus} />
            </div>

            <p className="mt-1 text-sm text-slate-600">
              {assignment.vehicle_registration || 'Vehicle not recorded'}
              {assignment.vehicle_make_model
                ? ` · ${assignment.vehicle_make_model}`
                : ''}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              Visit #{assignment.visit_id}
              {assignment.service_code
                ? ` · ${assignment.service_code}`
                : ''}
              {assignment.service_category
                ? ` · ${assignment.service_category === 'CAR_WASH'
                    ? 'Car wash'
                    : 'Detailing'}`
                : ''}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm font-semibold text-slate-900">
            {formatKES(assignment.service_price)}
          </p>
          <p className="text-xs text-slate-500">Catalogue price</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-500">Assigned employee</p>
          <p className="mt-1 font-medium text-slate-900">
            {assignment.staff_name || 'Employee not recorded'}
          </p>
          <p className="text-xs text-slate-500">
            {assignment.staff_number || ''}
          </p>
        </div>

        <div>
          <p className="text-xs text-slate-500">Assignment created</p>
          <p className="mt-1 text-sm text-slate-800">
            {formatDateTime(assignment.assigned_at)}
          </p>
          <p className="text-xs text-slate-500">
            By {assignment.assigned_by_name || 'Supervisor'}
          </p>
        </div>

        {assignment.completed_at && (
          <div>
            <p className="text-xs text-slate-500">Completed</p>
            <p className="mt-1 text-sm text-green-800">
              {formatDateTime(assignment.completed_at)}
            </p>
            <p className="text-xs text-slate-500">
              Confirmed by {assignment.completed_by_name || 'Employee'}
            </p>
          </div>
        )}

        {!assignment.is_active && (
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">Removal history</p>
            <p className="mt-1 text-sm text-slate-700">
              {assignment.removal_reason || 'No reason recorded'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatDateTime(assignment.removed_at)}
              {assignment.removed_by_name
                ? ` · By ${assignment.removed_by_name}`
                : ''}
            </p>
          </div>
        )}
      </div>

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onComplete(assignment)}
            disabled={actionBusy}
            className="inline-flex items-center justify-center rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-100 disabled:opacity-50"
          >
            <CheckCircle2 size={16} className="mr-2" />
            Mark complete
          </button>

          <button
            type="button"
            onClick={() => onOpenReassign(assignment)}
            disabled={actionBusy}
            className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            <UserPlus size={16} className="mr-2" />
            Reassign / edit
          </button>

          <button
            type="button"
            onClick={() => onRemove(assignment)}
            disabled={actionBusy}
            className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            <UserMinus size={16} className="mr-2" />
            Remove
          </button>
        </div>
      )}
    </article>
  )
}

export default function MonitorAssignmentsPage() {
  const [assignments, setAssignments] = useState([])
  const [branchName, setBranchName] = useState('')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const [staff, setStaff] = useState([])
  const [staffLoaded, setStaffLoaded] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(false)

  const [reassignTarget, setReassignTarget] = useState(null)
  const [newStaffId, setNewStaffId] = useState('')
  const [reassignReason, setReassignReason] = useState('')

  const [busyAssignmentId, setBusyAssignmentId] = useState(null)

  const loadAssignments = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const result = await getSupervisorAssignments({
        status: 'ALL',
      })

      setAssignments(result.assignments || [])
      setBranchName(result.branch_name || '')
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadAssignments()
  }, [loadAssignments])

  const summary = useMemo(() => {
    const active = assignments.filter(
      (item) => getAssignmentStatus(item) === 'ACTIVE'
    ).length

    const completed = assignments.filter(
      (item) => getAssignmentStatus(item) === 'COMPLETED'
    ).length

    const removed = assignments.filter(
      (item) => getAssignmentStatus(item) === 'REMOVED'
    ).length

    return {
      total: assignments.length,
      active,
      completed,
      removed,
    }
  }, [assignments])

  const filteredAssignments = useMemo(() => {
    const query = search.trim().toLowerCase()

    return assignments.filter((assignment) => {
      const currentStatus = getAssignmentStatus(assignment)

      if (
        statusFilter !== 'ALL' &&
        currentStatus !== statusFilter
      ) {
        return false
      }

      if (!query) return true

      const searchable = [
        assignment.vehicle_registration,
        assignment.vehicle_make_model,
        assignment.service_name,
        assignment.service_code,
        assignment.staff_name,
        assignment.staff_number,
        assignment.visit_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [assignments, search, statusFilter])

  const loadBranchStaff = async () => {
    if (staffLoaded) return

    setLoadingStaff(true)

    try {
      const result = await getBranchStaff()
      setStaff(result.filter(
        (member) =>
          member.employment_status === 'ACTIVE' &&
          !member.is_archived
      ))
      setStaffLoaded(true)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
      throw loadError
    } finally {
      setLoadingStaff(false)
    }
  }

  const handleOpenReassign = async (assignment) => {
    setError('')
    setSuccess('')
    setReassignTarget(assignment)
    setNewStaffId('')
    setReassignReason('')

    try {
      await loadBranchStaff()
    } catch {
      setReassignTarget(null)
    }
  }

  const handleCancelReassign = () => {
    if (busyAssignmentId !== null) return

    setReassignTarget(null)
    setNewStaffId('')
    setReassignReason('')
  }

  const handleReassign = async () => {
    if (!reassignTarget || !newStaffId || reassignReason.trim().length < 3) {
      setError('Select a replacement employee and provide a reason.')
      return
    }

    setBusyAssignmentId(reassignTarget.id)
    setError('')
    setSuccess('')

    try {
      const result = await reassignSupervisorAssignment(
        reassignTarget.id,
        {
          new_staff_id: Number(newStaffId),
          reason: reassignReason.trim(),
        }
      )

      setReassignTarget(null)
      setNewStaffId('')
      setReassignReason('')

      setSuccess(result.detail || 'Assignment reassigned successfully.')
      await loadAssignments(true)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusyAssignmentId(null)
    }
  }

  const handleComplete = async (assignment) => {
    const confirmed = window.confirm(
      `Mark ${assignment.service_name} assigned to ${assignment.staff_name} as completed? The system will record you as the supervisor who confirmed it.`
    )

    if (!confirmed) return

    setBusyAssignmentId(assignment.id)
    setError('')
    setSuccess('')

    try {
      const result = await completeSupervisorAssignment(assignment.id)

      setSuccess(result.detail || 'Assignment marked as completed.')
      await loadAssignments(true)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusyAssignmentId(null)
    }
  }

  const handleRemove = async (assignment) => {
    const reason = window.prompt(
      `Enter the reason for removing ${assignment.staff_name} from ${assignment.service_name}:`
    )

    if (reason === null) return

    if (reason.trim().length < 3) {
      setError('Please provide a meaningful removal reason.')
      return
    }

    setBusyAssignmentId(assignment.id)
    setError('')
    setSuccess('')

    try {
      const result = await removeSupervisorAssignment(
        assignment.id,
        { reason: reason.trim() }
      )

      setSuccess(result.detail || 'Assignment removed successfully.')
      await loadAssignments(true)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusyAssignmentId(null)
    }
  }

  const filteredCount = filteredAssignments.length

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <ClipboardList size={25} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Monitor Assignments
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Review and manage service assignments you created
              {branchName ? ` at ${branchName}` : ''}.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadAssignments(true)}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 size={17} className="mr-2 animate-spin" />
          ) : (
            <RefreshCw size={17} className="mr-2" />
          )}
          Refresh
        </button>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setError('')}
            className="ml-auto text-red-700 hover:text-red-900"
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
          <p>{success}</p>
          <button
            type="button"
            onClick={() => setSuccess('')}
            className="ml-auto text-green-700 hover:text-green-900"
            aria-label="Dismiss success"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total assignments"
          value={summary.total}
          icon={ClipboardList}
          description="All assignment records you created"
        />

        <SummaryCard
          label="Active"
          value={summary.active}
          icon={Clock3}
          description="Awaiting completion"
        />

        <SummaryCard
          label="Completed"
          value={summary.completed}
          icon={CheckCircle2}
          description="Completion confirmed"
        />

        <SummaryCard
          label="Removed"
          value={summary.removed}
          icon={History}
          description="Preserved in assignment history"
        />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Search assignments
            </label>

            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Vehicle registration, employee, service or visit number"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="w-full lg:w-56">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Assignment status
            </label>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="ALL">All assignments</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="REMOVED">Removed</option>
            </select>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Showing {filteredCount} of {assignments.length} assignments created
          by you.
        </p>
      </section>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-600">
          <Loader2 size={22} className="mr-3 animate-spin" />
          Loading your assignments...
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
          <ClipboardList
            size={34}
            className="mx-auto text-slate-400"
          />

          <h3 className="mt-3 font-semibold text-slate-800">
            No assignments found
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            {assignments.length === 0
              ? 'Assignments you create through Check-in will appear here.'
              : 'Try changing the search term or status filter.'}
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {filteredAssignments.map((assignment) => (
            <div key={assignment.id}>
              <AssignmentCard
                assignment={assignment}
                onComplete={handleComplete}
                onRemove={handleRemove}
                onOpenReassign={handleOpenReassign}
                actionBusy={busyAssignmentId === assignment.id}
              />

              {reassignTarget?.id === assignment.id && (
                <ReassignPanel
                  assignment={assignment}
                  staff={staff}
                  loadingStaff={loadingStaff}
                  saving={busyAssignmentId === assignment.id}
                  selectedStaffId={newStaffId}
                  reason={reassignReason}
                  onStaffChange={setNewStaffId}
                  onReasonChange={setReassignReason}
                  onCancel={handleCancelReassign}
                  onSubmit={handleReassign}
                />
              )}
            </div>
          ))}
        </section>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
        <CarFront size={16} className="mt-0.5 shrink-0" />
        <p>
          This page displays assignments created by your supervisor account
          within your assigned branch. Reassignment and removal preserve the
          original assignment record. Completed work cannot be reassigned or
          removed.
        </p>
      </div>
    </div>
  )
}

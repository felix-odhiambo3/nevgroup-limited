
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
  History,
  Building2,
  ShieldCheck,
  Eye,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  getSupervisorAssignments,
  reassignSupervisorAssignment,
  completeSupervisorAssignment,
  removeSupervisorAssignment,
  getAssignmentCorrections,
  correctCompletedAssignment,
} from '../api/visits'

import { getBranchStaff } from '../api/staffOperations'

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

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
  staff?.full_name ||
  staff?.user?.full_name ||
  staff?.username ||
  staff?.user?.username ||
  staff?.staff_number ||
  `Staff member #${staff?.id}`

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

const roleLabels = {
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Administrator',
  OWNER: 'Owner',
}

// --------------------------------------------------
// SHARED UI
// --------------------------------------------------

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

// --------------------------------------------------
// EMPLOYEE SELECTOR
// --------------------------------------------------

function EmployeeSelector({
  staff,
  assignment,
  selectedStaffId,
  onStaffChange,
  label,
  loading,
}) {
  const expectedRole = getExpectedRole(assignment.service_category)

  const eligibleStaff = staff.filter(
    (member) =>
      member.role === expectedRole &&
      Number(member.id) !== Number(assignment.staff) &&
      member.employment_status === 'ACTIVE' &&
      !member.is_archived
  )

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 size={16} className="animate-spin" />
        Loading eligible employees...
      </div>
    )
  }

  if (!expectedRole) {
    return (
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
        This service category does not support employee replacement.
      </p>
    )
  }

  if (eligibleStaff.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        No other active eligible employees were found in this branch.
      </p>
    )
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label} *
      </label>

      <select
        value={selectedStaffId}
        onChange={(event) => onStaffChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
      >
        <option value="">Select employee</option>

        {eligibleStaff.map((member) => (
          <option key={member.id} value={member.id}>
            {getStaffName(member)}
            {member.staff_number ? ` (${member.staff_number})` : ''}
            {member.current_shift ? ` — ${member.current_shift}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

// --------------------------------------------------
// SUPERVISOR REASSIGNMENT PANEL
// --------------------------------------------------

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

      <div className="mt-4 space-y-3">
        <EmployeeSelector
          staff={staff}
          assignment={assignment}
          selectedStaffId={selectedStaffId}
          onStaffChange={onStaffChange}
          label="Replacement employee"
          loading={loadingStaff}
        />

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
            disabled={
              saving ||
              loadingStaff ||
              !selectedStaffId ||
              reason.trim().length < 3
            }
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
    </div>
  )
}

// --------------------------------------------------
// COMPLETED ASSIGNMENT CORRECTION PANEL
// --------------------------------------------------

function CorrectionPanel({
  assignment,
  staff,
  loadingStaff,
  loadingHistory,
  history,
  saving,
  selectedStaffId,
  reason,
  onStaffChange,
  onReasonChange,
  onCancel,
  onSubmit,
}) {
  return (
    <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={19} className="text-purple-700" />
            <h4 className="font-semibold text-slate-900">
              Correct completed assignment
            </h4>
          </div>

          <p className="mt-1 text-sm text-slate-600">
            This changes the employee recorded on this completed assignment.
            The original completion time and confirmation remain unchanged.
          </p>
        </div>

        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg p-1 text-slate-500 hover:bg-white hover:text-slate-800"
          aria-label="Close correction panel"
        >
          <X size={18} />
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-purple-100 bg-white p-3">
        <p className="text-xs text-slate-500">Currently recorded employee</p>
        <p className="mt-1 font-semibold text-slate-900">
          {assignment.staff_name || 'Employee not recorded'}
        </p>
        <p className="text-xs text-slate-500">
          {assignment.staff_number || ''}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <EmployeeSelector
          staff={staff}
          assignment={assignment}
          selectedStaffId={selectedStaffId}
          onStaffChange={onStaffChange}
          label="Correct employee to"
          loading={loadingStaff}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Reason for correction *
          </label>

          <textarea
            rows={3}
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Explain why the original employee record needs correction."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-500"
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
            disabled={
              saving ||
              loadingStaff ||
              !selectedStaffId ||
              reason.trim().length < 3
            }
            className="inline-flex items-center justify-center rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                Saving correction...
              </>
            ) : (
              <>
                <ShieldCheck size={15} className="mr-2" />
                Confirm correction
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-purple-200 pt-4">
        <div className="flex items-center gap-2">
          <History size={17} className="text-purple-700" />
          <h5 className="font-semibold text-slate-900">
            Correction history
          </h5>
        </div>

        {loadingHistory ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Loader2 size={15} className="animate-spin" />
            Loading correction history...
          </div>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            No corrections have been made to this assignment.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {item.previous_staff_name || 'Previous employee'}
                    {' → '}
                    {item.new_staff_name || 'New employee'}
                  </p>

                  <span className="text-xs text-slate-500">
                    {formatDateTime(item.created_at)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-700">
                  {item.reason}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  Corrected by {item.corrected_by_name || 'Administrator'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --------------------------------------------------
// ASSIGNMENT CARD
// --------------------------------------------------

function AssignmentCard({
  assignment,
  role,
  onComplete,
  onRemove,
  onOpenReassign,
  onOpenCorrection,
  onViewCorrectionHistory,
  actionBusy,
}) {
  const currentStatus = getAssignmentStatus(assignment)

  const isSupervisor = role === 'SUPERVISOR'
  const canManage = isSupervisor && currentStatus === 'ACTIVE'
  const canCorrect =
    (role === 'ADMIN' || role === 'OWNER') &&
    currentStatus === 'COMPLETED'

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
                ? ` · ${
                    assignment.service_category === 'CAR_WASH'
                      ? 'Car wash'
                      : 'Detailing'
                  }`
                : ''}
            </p>

            {role === 'OWNER' && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                <Building2 size={13} />
                {assignment.branch_name || `Branch #${assignment.branch_id}`}
              </p>
            )}
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
            By {assignment.assigned_by_name || 'Staff member'}
          </p>
        </div>

        {assignment.completed_at && (
          <div>
            <p className="text-xs text-slate-500">Completed</p>
            <p className="mt-1 text-sm text-green-800">
              {formatDateTime(assignment.completed_at)}
            </p>
            <p className="text-xs text-slate-500">
              Confirmed by {assignment.completed_by_name || 'Staff member'}
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

      {canCorrect && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => onOpenCorrection(assignment)}
            disabled={actionBusy}
            className="inline-flex items-center justify-center rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-800 hover:bg-purple-100 disabled:opacity-50"
          >
            <ShieldCheck size={16} className="mr-2" />
            Correct employee
          </button>

          <button
            type="button"
            onClick={() => onViewCorrectionHistory(assignment)}
            disabled={actionBusy}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Eye size={16} className="mr-2" />
            View correction history
          </button>
        </div>
      )}
    </article>
  )
}

// --------------------------------------------------
// MAIN PAGE
// --------------------------------------------------

export default function MonitorAssignmentsPage() {
  const { user } = useAuth()

  const role = user?.is_superuser
    ? 'OWNER'
    : String(user?.role || '').toUpperCase()

  const isSupervisor = role === 'SUPERVISOR'
  const isAdmin = role === 'ADMIN'
  const isOwner = role === 'OWNER'
  const canCorrect = isAdmin || isOwner

  const [assignments, setAssignments] = useState([])
  const [branchName, setBranchName] = useState('')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [statusFilter, setStatusFilter] = useState('ALL')
  const [search, setSearch] = useState('')

  const [staff, setStaff] = useState([])
  const [loadingStaff, setLoadingStaff] = useState(false)

  const [reassignTarget, setReassignTarget] = useState(null)
  const [correctionTarget, setCorrectionTarget] = useState(null)

  const [newStaffId, setNewStaffId] = useState('')
  const [reassignReason, setReassignReason] = useState('')

  const [correctionStaffId, setCorrectionStaffId] = useState('')
  const [correctionReason, setCorrectionReason] = useState('')

  const [correctionHistory, setCorrectionHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const [busyAssignmentId, setBusyAssignmentId] = useState(null)

  // --------------------------------------------------
  // LOAD ASSIGNMENTS
  // --------------------------------------------------

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

  // --------------------------------------------------
  // SUMMARY
  // --------------------------------------------------

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

  // --------------------------------------------------
  // SEARCH AND FILTER
  // --------------------------------------------------

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
        assignment.branch_name,
        assignment.branch_id,
        assignment.assigned_by_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(query)
    })
  }, [assignments, search, statusFilter])

  // --------------------------------------------------
  // LOAD STAFF FOR THE RELEVANT BRANCH
  // --------------------------------------------------

  const loadStaffForAssignment = async (assignment) => {
    setLoadingStaff(true)
    setStaff([])

    try {
      const params = {}

      // ADMIN and OWNER must load employees from the assignment's branch.
      // Supervisors are automatically restricted by the backend.
      if (canCorrect) {
        params.branch_id = assignment.branch_id
      }

      const result = await getBranchStaff(params)

      const activeStaff = result.filter(
        (member) =>
          member.employment_status === 'ACTIVE' &&
          !member.is_archived
      )

      setStaff(activeStaff)
      return activeStaff
    } catch (loadError) {
      setError(getErrorMessage(loadError))
      throw loadError
    } finally {
      setLoadingStaff(false)
    }
  }

  // --------------------------------------------------
  // SUPERVISOR REASSIGNMENT
  // --------------------------------------------------

  const handleOpenReassign = async (assignment) => {
    setError('')
    setSuccess('')

    setCorrectionTarget(null)
    setReassignTarget(assignment)

    setNewStaffId('')
    setReassignReason('')

    try {
      await loadStaffForAssignment(assignment)
    } catch {
      setReassignTarget(null)
    }
  }

  const handleCancelReassign = () => {
    if (busyAssignmentId !== null) return

    setReassignTarget(null)
    setNewStaffId('')
    setReassignReason('')
    setStaff([])
  }

  const handleReassign = async () => {
    if (
      !reassignTarget ||
      !newStaffId ||
      reassignReason.trim().length < 3
    ) {
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
      setStaff([])

      setSuccess(result.detail || 'Assignment reassigned successfully.')
      await loadAssignments(true)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusyAssignmentId(null)
    }
  }

  // --------------------------------------------------
  // SUPERVISOR COMPLETE
  // --------------------------------------------------

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

  // --------------------------------------------------
  // SUPERVISOR REMOVE
  // --------------------------------------------------

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

  // --------------------------------------------------
  // ADMIN / OWNER OPEN CORRECTION
  // --------------------------------------------------

  const handleOpenCorrection = async (assignment) => {
    setError('')
    setSuccess('')

    setReassignTarget(null)
    setCorrectionTarget(assignment)

    setCorrectionStaffId('')
    setCorrectionReason('')
    setCorrectionHistory([])

    setLoadingHistory(true)

    try {
      await Promise.all([
        loadStaffForAssignment(assignment),
        getAssignmentCorrections(assignment.id).then((result) => {
          setCorrectionHistory(result.corrections || [])
        }),
      ])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoadingHistory(false)
    }
  }

  // --------------------------------------------------
  // VIEW CORRECTION HISTORY
  // --------------------------------------------------

  const handleViewCorrectionHistory = async (assignment) => {
    setError('')
    setSuccess('')

    setReassignTarget(null)
    setCorrectionTarget(assignment)

    setCorrectionStaffId('')
    setCorrectionReason('')
    setCorrectionHistory([])

    setLoadingHistory(true)
    setLoadingStaff(false)
    setStaff([])

    try {
      const result = await getAssignmentCorrections(assignment.id)

      setCorrectionHistory(result.corrections || [])
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleCancelCorrection = () => {
    if (busyAssignmentId !== null) return

    setCorrectionTarget(null)
    setCorrectionStaffId('')
    setCorrectionReason('')
    setCorrectionHistory([])
    setStaff([])
  }

  // --------------------------------------------------
  // ADMIN / OWNER SAVE CORRECTION
  // --------------------------------------------------

  const handleCorrectAssignment = async () => {
    if (
      !correctionTarget ||
      !correctionStaffId ||
      correctionReason.trim().length < 3
    ) {
      setError('Select an employee and provide a meaningful correction reason.')
      return
    }

    const confirmed = window.confirm(
      `Correct the completed assignment for ${correctionTarget.service_name}?\n\nThe recorded employee will change, but the original completion time and confirmation will be preserved.`
    )

    if (!confirmed) return

    setBusyAssignmentId(correctionTarget.id)
    setError('')
    setSuccess('')

    try {
      const result = await correctCompletedAssignment(
        correctionTarget.id,
        {
          new_staff_id: Number(correctionStaffId),
          reason: correctionReason.trim(),
        }
      )

      setCorrectionHistory((previous) => [
        result.correction,
        ...previous,
      ])

      setCorrectionStaffId('')
      setCorrectionReason('')

      setSuccess(
        result.detail || 'Completed assignment corrected successfully.'
      )

      await loadAssignments(true)
    } catch (actionError) {
      setError(getErrorMessage(actionError))
    } finally {
      setBusyAssignmentId(null)
    }
  }

  // --------------------------------------------------
  // ROLE-SPECIFIC PAGE CONTENT
  // --------------------------------------------------

  const pageTitle = isOwner
    ? 'All Branch Assignments'
    : isAdmin
      ? 'Branch Assignment Monitoring'
      : 'Monitor Assignments'

  const pageDescription = isOwner
    ? 'Monitor service assignments across all branches.'
    : isAdmin
      ? `Monitor all service assignments in ${branchName || 'your branch'}.`
      : `Review and manage service assignments you created${
          branchName ? ` at ${branchName}` : ''
        }.`

  const totalDescription = isSupervisor
    ? 'Assignment records you created'
    : 'Assignment records in your access scope'

  const filteredCount = filteredAssignments.length

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <ClipboardList size={25} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {pageTitle}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {pageDescription}
            </p>

            <p className="mt-1 text-xs font-medium text-slate-500">
              {roleLabels[role] || 'Staff'}
              {branchName ? ` · ${branchName}` : ''}
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
          description={totalDescription}
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
                placeholder="Vehicle, employee, service, branch or visit number"
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
          Showing {filteredCount} of {assignments.length} assignments.
        </p>
      </section>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-600">
          <Loader2 size={22} className="mr-3 animate-spin" />
          Loading assignments...
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
              ? 'Assignments will appear here when they are created.'
              : 'Try changing the search term or status filter.'}
          </p>
        </div>
      ) : (
        <section className="space-y-4">
          {filteredAssignments.map((assignment) => (
            <div key={assignment.id}>
              <AssignmentCard
                assignment={assignment}
                role={role}
                onComplete={handleComplete}
                onRemove={handleRemove}
                onOpenReassign={handleOpenReassign}
                onOpenCorrection={handleOpenCorrection}
                onViewCorrectionHistory={handleViewCorrectionHistory}
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

              {canCorrect &&
                correctionTarget?.id === assignment.id && (
                  <CorrectionPanel
                    assignment={assignment}
                    staff={staff}
                    loadingStaff={loadingStaff}
                    loadingHistory={loadingHistory}
                    history={correctionHistory}
                    saving={busyAssignmentId === assignment.id}
                    selectedStaffId={correctionStaffId}
                    reason={correctionReason}
                    onStaffChange={setCorrectionStaffId}
                    onReasonChange={setCorrectionReason}
                    onCancel={handleCancelCorrection}
                    onSubmit={handleCorrectAssignment}
                  />
                )}
            </div>
          ))}
        </section>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-600">
        <CarFront size={16} className="mt-0.5 shrink-0" />

        <p>
          {isSupervisor
            ? 'You can monitor and manage assignments you created within your assigned branch. You can reassign, complete or remove active unfinished assignments. Completed assignments cannot be changed by supervisors.'
            : isAdmin
              ? 'You can monitor all assignments in your assigned branch. You can correct completed assignment employee records. Every correction is recorded in the audit history.'
              : 'You can monitor assignments across all branches. You can correct completed assignment employee records. Every correction is recorded in the audit history.'}
        </p>
      </div>
    </div>
  )
}
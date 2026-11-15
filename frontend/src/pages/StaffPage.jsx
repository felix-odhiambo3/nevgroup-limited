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
  CheckCircle2,
  UserX,
  ShieldAlert,
  Archive,
  History,
  Clock,
  Pencil,
  Shield,
  CalendarClock,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  getStaff,
  registerStaff,
  updateStaff,
  updateStaffStatus,
  getStaffStatusHistory,
  updateStaffRole,
  getStaffRoleHistory,
  getStaffShiftHistory,
  changeStaffShift,
} from '../api/staff'

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

const initialEditForm = {
  staff_number: '',
  branch: '',
  phone_number: '',
  date_joined: '',
}

const inputClass =
  'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed'

const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

const roleOptions = [
  { value: 'CLEANER', label: 'Cleaner' },
  { value: 'DETAILER', label: 'Detailer' },
  { value: 'SUPERVISOR', label: 'Supervisor' },
  { value: 'ACCOUNTS', label: 'Accounts' },
  { value: 'ADMIN', label: 'Administrator' },
]

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

function SummaryCard({ label, value, description }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      {description && (
        <p className="text-xs text-slate-500 mt-1">{description}</p>
      )}
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

function getActionLabel(action) {
  const labels = {
    ACTIVATED: 'Activated',
    DEACTIVATED: 'Deactivated',
    SUSPENDED: 'Suspended',
    ARCHIVED: 'Archived',
  }

  return labels[action] || action
}

function formatDateTime(value) {
  if (!value) return 'Not available'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString()
}

function formatRole(role) {
  if (!role) return 'Not assigned'

  return role
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function Modal({ title, description, onClose, children, footer, maxWidth = 'max-w-xl' }) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={`bg-white w-full ${maxWidth} max-h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden`}>
        <div className="px-6 py-5 border-b border-slate-200 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>
            {description && (
              <p className="text-sm text-slate-500 mt-1">{description}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryList({ items, loading, error, emptyTitle, emptyDescription, renderItem }) {
  if (loading) {
    return (
      <div className="py-8 text-center text-slate-500">
        <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
        Loading history...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 whitespace-pre-line">
        {error}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="py-8 text-center">
        <History size={30} className="mx-auto text-slate-300 mb-3" />
        <p className="font-medium text-slate-700">{emptyTitle}</p>
        <p className="text-sm text-slate-500 mt-1">{emptyDescription}</p>
      </div>
    )
  }

  return <div className="space-y-3">{items.map(renderItem)}</div>
}

export default function StaffPage() {
  const { user } = useAuth()

  const currentRole = user?.role
  const canManageRoles = ['OWNER', 'ADMIN'].includes(currentRole)
  const canManageAdminRole =
    currentRole === 'OWNER' || Boolean(user?.is_superuser)

  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])

  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [branchesLoading, setBranchesLoading] = useState(true)

  const [error, setError] = useState('')
  const [branchError, setBranchError] = useState('')
  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [showDirectory, setShowDirectory] = useState(false)

  const [showModal, setShowModal] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(initialForm)

  const [detailsMember, setDetailsMember] = useState(null)

  const [editingMember, setEditingMember] = useState(null)
  const [editForm, setEditForm] = useState(initialEditForm)
  const [editError, setEditError] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [selectedMember, setSelectedMember] = useState(null)
  const [pendingAction, setPendingAction] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const [historyMember, setHistoryMember] = useState(null)
  const [historyItems, setHistoryItems] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  // Role management state.
  const [showRoleManagement, setShowRoleManagement] = useState(false)
  const [roleMember, setRoleMember] = useState(null)
  const [roleValue, setRoleValue] = useState('')
  const [roleReason, setRoleReason] = useState('')
  const [roleError, setRoleError] = useState('')
  const [roleLoading, setRoleLoading] = useState(false)
  const [roleHistory, setRoleHistory] = useState([])
  const [roleHistoryLoading, setRoleHistoryLoading] = useState(false)
  const [roleHistoryError, setRoleHistoryError] = useState('')

  // Shift management state.
  const [showShiftManagement, setShowShiftManagement] = useState(false)
  const [shiftMember, setShiftMember] = useState(null)
  const [shiftValue, setShiftValue] = useState('DAY')
  const [shiftEffectiveFrom, setShiftEffectiveFrom] = useState(getToday())
  const [shiftReason, setShiftReason] = useState('')
  const [shiftError, setShiftError] = useState('')
  const [shiftLoading, setShiftLoading] = useState(false)
  const [shiftHistory, setShiftHistory] = useState([])
  const [shiftHistoryLoading, setShiftHistoryLoading] = useState(false)
  const [shiftHistoryError, setShiftHistoryError] = useState('')

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
        member.current_shift,
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

  const updateEditField = (event) => {
    const { name, value } = event.target

    setEditForm((previous) => ({
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

    if (branches.length === 0) loadBranches()
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

  const openEdit = (member) => {
    setEditingMember(member)
    setEditForm({
      staff_number: member.staff_number || '',
      branch: member.branch ? String(member.branch) : '',
      phone_number: member.phone_number || '',
      date_joined: member.date_joined || '',
    })
    setEditError('')
    setSuccessMessage('')

    if (branches.length === 0) loadBranches()
  }

  const closeEdit = () => {
    if (editSubmitting) return

    setEditingMember(null)
    setEditForm(initialEditForm)
    setEditError('')
  }

  const handleEdit = async (event) => {
    event.preventDefault()

    if (!editingMember) return

    setEditError('')
    setSuccessMessage('')

    if (!editForm.staff_number.trim()) {
      setEditError('Staff number is required.')
      return
    }

    if (!editForm.branch) {
      setEditError('Please select a branch.')
      return
    }

    if (!editForm.date_joined) {
      setEditError('Date joined is required.')
      return
    }

    if (editForm.date_joined > getToday()) {
      setEditError('Date joined cannot be in the future.')
      return
    }

    const payload = {
      staff_number: editForm.staff_number.trim(),
      branch: Number(editForm.branch),
      phone_number: editForm.phone_number.trim(),
      date_joined: editForm.date_joined,
    }

    setEditSubmitting(true)

    try {
      await updateStaff(editingMember.id, payload)

      setSuccessMessage('Staff profile updated successfully.')
      closeEdit()
      await loadStaff()
    } catch (err) {
      setEditError(getErrorMessage(err))
    } finally {
      setEditSubmitting(false)
    }
  }

  const openStatusAction = (member, action) => {
    setSelectedMember(member)
    setPendingAction(action)
    setActionReason('')
    setActionError('')
  }

  const closeStatusAction = () => {
    if (actionLoading) return

    setSelectedMember(null)
    setPendingAction('')
    setActionReason('')
    setActionError('')
  }

  const handleStatusAction = async (event) => {
    event.preventDefault()

    if (!selectedMember || !pendingAction) return

    if (
      ['SUSPEND', 'DEACTIVATE', 'ARCHIVE'].includes(pendingAction) &&
      !actionReason.trim()
    ) {
      setActionError('Please provide a reason for this action.')
      return
    }

    setActionLoading(true)
    setActionError('')
    setSuccessMessage('')

    try {
      const response = await updateStaffStatus(selectedMember.id, {
        action: pendingAction,
        reason: actionReason.trim(),
      })

      const messages = {
        ACTIVATE: 'Staff member activated successfully.',
        DEACTIVATE: 'Staff member deactivated successfully.',
        SUSPEND: 'Staff member suspended successfully.',
        ARCHIVE: 'Staff member archived successfully.',
      }

      setSuccessMessage(response.detail || messages[pendingAction])

      closeStatusAction()
      await loadStaff()
    } catch (err) {
      setActionError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const openHistory = async (member) => {
    setHistoryMember(member)
    setHistoryItems([])
    setHistoryError('')
    setHistoryLoading(true)

    try {
      const data = await getStaffStatusHistory(member.id)
      setHistoryItems(data)
    } catch (err) {
      setHistoryError(getErrorMessage(err))
    } finally {
      setHistoryLoading(false)
    }
  }

  const closeHistory = () => {
    setHistoryMember(null)
    setHistoryItems([])
    setHistoryError('')
  }

  // ---------------- ROLE MANAGEMENT ----------------

  const openRoleManagement = () => {
    setShowRoleManagement(true)
    setRoleMember(null)
    setRoleHistory([])
    setRoleError('')
    setRoleHistoryError('')
    setRoleReason('')
    setRoleValue('')
    setSuccessMessage('')
  }

  const closeRoleManagement = () => {
    if (roleLoading) return

    setShowRoleManagement(false)
    setRoleMember(null)
    setRoleHistory([])
    setRoleError('')
    setRoleHistoryError('')
    setRoleReason('')
  }

  const selectRoleMember = async (member) => {
    setRoleMember(member)
    setRoleValue(member.role || '')
    setRoleReason('')
    setRoleError('')
    setRoleHistory([])
    setRoleHistoryError('')
    setRoleHistoryLoading(true)

    try {
      if (!member.user) {
        throw new Error('This staff profile does not contain a linked user ID.')
      }

      const data = await getStaffRoleHistory(member.user)
      setRoleHistory(data)
    } catch (err) {
      setRoleHistoryError(
        err.message || getErrorMessage(err)
      )
    } finally {
      setRoleHistoryLoading(false)
    }
  }

  const handleRoleChange = async (event) => {
    event.preventDefault()

    if (!roleMember) return

    setRoleError('')

    if (!roleValue) {
      setRoleError('Please select a role.')
      return
    }

    if (roleValue === roleMember.role) {
      setRoleError('The selected role is already assigned.')
      return
    }

    if (!roleReason.trim()) {
      setRoleError('A reason is required when changing a staff role.')
      return
    }

    if (roleMember.role === 'OWNER') {
      setRoleError('Owner accounts cannot be changed through staff role management.')
      return
    }

    if (roleValue === 'ADMIN' && !canManageAdminRole) {
      setRoleError('Only an Owner or superuser can assign the Administrator role.')
      return
    }

    setRoleLoading(true)

    try {
      await updateStaffRole(roleMember.user, {
        role: roleValue,
        role_change_reason: roleReason.trim(),
      })

      setSuccessMessage(
        `Role updated successfully for ${roleMember.full_name || roleMember.username}.`
      )

      setRoleReason('')
      await loadStaff()

      const updatedMember = {
        ...roleMember,
        role: roleValue,
      }

      setRoleMember(updatedMember)

      const updatedHistory = await getStaffRoleHistory(roleMember.user)
      setRoleHistory(updatedHistory)
    } catch (err) {
      setRoleError(getErrorMessage(err))
    } finally {
      setRoleLoading(false)
    }
  }

  // ---------------- SHIFT MANAGEMENT ----------------

  const openShiftManagement = () => {
    setShowShiftManagement(true)
    setShiftMember(null)
    setShiftHistory([])
    setShiftError('')
    setShiftHistoryError('')
    setShiftReason('')
    setShiftValue('DAY')
    setShiftEffectiveFrom(getToday())
    setSuccessMessage('')
  }

  const closeShiftManagement = () => {
    if (shiftLoading) return

    setShowShiftManagement(false)
    setShiftMember(null)
    setShiftHistory([])
    setShiftError('')
    setShiftHistoryError('')
    setShiftReason('')
  }

  const selectShiftMember = async (member) => {
    setShiftMember(member)
    setShiftValue(member.current_shift || 'DAY')
    setShiftEffectiveFrom(getToday())
    setShiftReason('')
    setShiftError('')
    setShiftHistory([])
    setShiftHistoryError('')
    setShiftHistoryLoading(true)

    try {
      const data = await getStaffShiftHistory(member.id)
      setShiftHistory(data)
    } catch (err) {
      setShiftHistoryError(getErrorMessage(err))
    } finally {
      setShiftHistoryLoading(false)
    }
  }

  const handleShiftChange = async (event) => {
    event.preventDefault()

    if (!shiftMember) return

    setShiftError('')

    if (!shiftEffectiveFrom) {
      setShiftError('Please select an effective date.')
      return
    }

    if (shiftEffectiveFrom < getToday()) {
      setShiftError('Shift changes cannot be backdated.')
      return
    }

    if (shiftValue === shiftMember.current_shift) {
      setShiftError('The selected shift is already assigned.')
      return
    }

    if (!shiftReason.trim()) {
      setShiftError('Please provide a reason for the shift change.')
      return
    }

    setShiftLoading(true)

    try {
      await changeStaffShift(shiftMember.id, {
        shift: shiftValue,
        effective_from: shiftEffectiveFrom,
        reason: shiftReason.trim(),
      })

      setSuccessMessage(
        `Shift updated successfully for ${shiftMember.full_name || shiftMember.username}.`
      )

      setShiftReason('')
      await loadStaff()

      const refreshedHistory = await getStaffShiftHistory(shiftMember.id)
      setShiftHistory(refreshedHistory)

      setShiftMember({
        ...shiftMember,
        current_shift: shiftValue,
      })
    } catch (err) {
      setShiftError(getErrorMessage(err))
    } finally {
      setShiftLoading(false)
    }
  }

  const actionDetails = {
    ACTIVATE: {
      title: 'Reactivate Staff Account',
      description:
        'This will restore the employee to active employment status and enable their login access.',
      button: 'Confirm Reactivation',
      buttonClass: 'bg-green-600 hover:bg-green-700',
      icon: <CheckCircle2 size={20} />,
      requiresReason: false,
    },
    DEACTIVATE: {
      title: 'Deactivate Staff Account',
      description:
        'This will set the employee to inactive and disable their login access. The employee will remain in the staff directory.',
      button: 'Confirm Deactivation',
      buttonClass: 'bg-slate-700 hover:bg-slate-800',
      icon: <UserX size={20} />,
      requiresReason: true,
    },
    SUSPEND: {
      title: 'Suspend Staff Account',
      description:
        'This will mark the employee as suspended and immediately disable their login access. The suspension will be recorded in the staff history.',
      button: 'Confirm Suspension',
      buttonClass: 'bg-red-600 hover:bg-red-700',
      icon: <ShieldAlert size={20} />,
      requiresReason: true,
    },
    ARCHIVE: {
      title: 'Archive Staff Account',
      description:
        'This will archive the employee record, disable login access and remove the employee from the normal staff directory. This action should be used when the record should no longer be active.',
      button: 'Confirm Archive',
      buttonClass: 'bg-red-700 hover:bg-red-800',
      icon: <Archive size={20} />,
      requiresReason: true,
    },
  }

  const currentAction = actionDetails[pendingAction]

  const manageableRoleMembers = staff.filter(
    (member) =>
      member.role !== 'OWNER' &&
      member.user &&
      member.employment_status !== 'ARCHIVED'
  )

  const shiftMembers = staff.filter(
    (member) => member.employment_status !== 'ARCHIVED'
  )

  return (
    <div className="space-y-7">
      {/* Page heading */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
            <Users size={23} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Staff Management
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage NEV CARWASH employees, roles, shifts and staff accounts.
            </p>
          </div>
        </div>

        {/* Four separate management buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openRegistration}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            <UserPlus size={18} />
            Register Staff
          </button>

          <button
            type="button"
            onClick={() => setShowDirectory((previous) => !previous)}
            aria-expanded={showDirectory}
            aria-controls="staff-directory"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 text-sm font-semibold transition-colors"
          >
            {showDirectory ? <EyeOff size={18} /> : <Eye size={18} />}
            {showDirectory ? 'Hide Members' : 'View Members'}
          </button>

          {canManageRoles && (
            <button
              type="button"
              onClick={openRoleManagement}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 text-sm font-semibold transition-colors"
            >
              <Shield size={18} />
              Manage Roles
            </button>
          )}

          <button
            type="button"
            onClick={openShiftManagement}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-sm font-semibold transition-colors"
          >
            <CalendarClock size={18} />
            Manage Shifts
          </button>
        </div>
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
        <SummaryCard
          label="Suspended"
          value={suspendedCount}
          description="Login access disabled"
        />
      </div>

      {/* Staff directory */}
      {showDirectory && (
        <section
          id="staff-directory"
          className="bg-white border border-slate-200 rounded-xl overflow-hidden"
        >
          <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="font-semibold text-slate-900">
                Staff Directory
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                View and manage employee records and account access.
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
                    <th className="px-5 py-4">Staff Number</th>
                    <th className="px-5 py-4">Branch</th>
                    <th className="px-5 py-4">Role</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Account Management</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((member) => {
                    const active = member.employment_status === 'ACTIVE'
                    const suspended = member.employment_status === 'SUSPENDED'
                    const inactive = member.employment_status === 'INACTIVE'
                    const isOwnerAccount = member.role === 'OWNER'

                    return (
                      <tr key={member.id} className="hover:bg-slate-50 align-top">
                        <td className="px-5 py-4 text-sm font-medium text-slate-800">
                          {member.staff_number || 'Not assigned'}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-700">
                          {member.branch_name || 'Not assigned'}
                        </td>

                        <td className="px-5 py-4 text-sm text-slate-700">
                          {formatRole(member.role)}
                        </td>

                        <td className="px-5 py-4">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(member.employment_status)}`}
                            >
                              {member.employment_status}
                            </span>
                            <p className="text-xs text-slate-500">
                              {active
                                ? 'Login expected enabled'
                                : 'Login disabled'}
                            </p>
                          </div>
                        </td>

                        <td className="px-5 py-4 min-w-[280px]">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setDetailsMember(member)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold"
                            >
                              <Eye size={14} />
                              View Full Details
                            </button>

                            {!isOwnerAccount && (
                              <button
                                type="button"
                                onClick={() => openEdit(member)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                            )}

                            {active && !isOwnerAccount && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openStatusAction(member, 'SUSPEND')}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs font-semibold"
                                >
                                  <ShieldAlert size={14} />
                                  Suspend
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openStatusAction(member, 'DEACTIVATE')}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold"
                                >
                                  <UserX size={14} />
                                  Deactivate
                                </button>
                              </>
                            )}

                            {(inactive || suspended) && !isOwnerAccount && (
                              <button
                                type="button"
                                onClick={() => openStatusAction(member, 'ACTIVATE')}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-semibold"
                              >
                                <CheckCircle2 size={14} />
                                {suspended ? 'Reactivate' : 'Activate'}
                              </button>
                            )}

                            {!isOwnerAccount && (
                              <button
                                type="button"
                                onClick={() => openStatusAction(member, 'ARCHIVE')}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 text-xs font-semibold"
                              >
                                <Archive size={14} />
                                Archive
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => openHistory(member)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold"
                            >
                              <History size={14} />
                              History
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
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
      )}

      {/* Full staff details modal */}
      {detailsMember && (
        <Modal
          title="Full Staff Details"
          description={`Complete available profile for ${detailsMember.full_name || detailsMember.username || detailsMember.staff_number}.`}
          onClose={() => setDetailsMember(null)}
          maxWidth="max-w-3xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ['Full Name', detailsMember.full_name],
              ['Username', detailsMember.username],
              ['Email Address', detailsMember.email],
              ['Phone Number', detailsMember.phone_number],
              ['Staff Number', detailsMember.staff_number],
              ['Branch', detailsMember.branch_name],
              ['Role', formatRole(detailsMember.role)],
              ['Employment Status', detailsMember.employment_status],
              ['Assigned Shift', detailsMember.current_shift],
              ['Date Joined', detailsMember.date_joined],
              ['Archived', detailsMember.is_archived === true ? 'Yes' : detailsMember.is_archived === false ? 'No' : null],
            ]
              .filter(([, value]) => value !== undefined && value !== null && value !== '')
              .map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold text-slate-900">
                    {value}
                  </p>
                </div>
              ))}
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => setDetailsMember(null)}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {/* Edit staff modal */}
      {editingMember && (
        <Modal
          title="Edit Staff Profile"
          description={`Update profile details for ${editingMember.full_name || editingMember.username}.`}
          onClose={closeEdit}
          footer={
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={closeEdit}
                disabled={editSubmitting}
                className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="staff-edit-form"
                disabled={editSubmitting || branchesLoading || branches.length === 0}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50"
              >
                {editSubmitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={17} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          }
        >
          <form id="staff-edit-form" onSubmit={handleEdit} className="space-y-5">
            {editError && (
              <div
                role="alert"
                className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 whitespace-pre-line"
              >
                {editError}
              </div>
            )}

            <div>
              <label htmlFor="edit_staff_number" className={labelClass}>
                Staff Number *
              </label>
              <input
                id="edit_staff_number"
                name="staff_number"
                value={editForm.staff_number}
                onChange={updateEditField}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label htmlFor="edit_branch" className={labelClass}>
                Branch *
              </label>
              <div className="relative">
                <Building2
                  size={17}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  id="edit_branch"
                  name="branch"
                  value={editForm.branch}
                  onChange={updateEditField}
                  className={`${inputClass} pl-10`}
                  required
                  disabled={branchesLoading || branches.length === 0}
                >
                  <option value="">
                    {branchesLoading ? 'Loading branches...' : 'Select branch'}
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </div>

              {branchError && (
                <p className="text-xs text-red-600 mt-1">{branchError}</p>
              )}
            </div>

            <div>
              <label htmlFor="edit_phone_number" className={labelClass}>
                Phone Number
              </label>
              <input
                id="edit_phone_number"
                name="phone_number"
                type="tel"
                value={editForm.phone_number}
                onChange={updateEditField}
                className={inputClass}
                placeholder="e.g. 0712345678"
              />
            </div>

            <div>
              <label htmlFor="edit_date_joined" className={labelClass}>
                Date Joined *
              </label>
              <input
                id="edit_date_joined"
                name="date_joined"
                type="date"
                value={editForm.date_joined}
                onChange={updateEditField}
                max={getToday()}
                className={inputClass}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Future dates are not allowed.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
              Role and assigned shift are managed separately using the role-management and shift-management workflows.
            </div>
          </form>
        </Modal>
      )}

      {/* Role management modal */}
      {showRoleManagement && (
        <Modal
          title="Manage Staff Roles"
          description="Change an employee's system role. Every role change requires a reason and is recorded in the audit history."
          onClose={closeRoleManagement}
          maxWidth="max-w-4xl"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div>
                <label htmlFor="role_member" className={labelClass}>
                  Select Staff Member
                </label>
                <select
                  id="role_member"
                  value={roleMember?.id || ''}
                  onChange={(event) => {
                    const member = manageableRoleMembers.find(
                      (item) => String(item.id) === event.target.value
                    )
                    if (member) selectRoleMember(member)
                  }}
                  className={inputClass}
                >
                  <option value="">Choose an employee</option>
                  {manageableRoleMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.username} — {member.staff_number}
                    </option>
                  ))}
                </select>
              </div>

              {roleMember && (
                <form onSubmit={handleRoleChange} className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="font-semibold text-slate-900">
                      {roleMember.full_name || roleMember.username}
                    </p>
                    <p className="text-sm text-slate-500">
                      {roleMember.staff_number} · {roleMember.email}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Current role</span>
                      <span className="font-semibold text-slate-800">
                        {formatRole(roleMember.role)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Employment status</span>
                      <span className="font-medium text-slate-800">
                        {roleMember.employment_status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new_staff_role" className={labelClass}>
                      New Role *
                    </label>
                    <select
                      id="new_staff_role"
                      value={roleValue}
                      onChange={(event) => setRoleValue(event.target.value)}
                      className={inputClass}
                      required
                    >
                      {roleOptions
                        .filter((option) =>
                          option.value !== 'ADMIN' || canManageAdminRole
                        )
                        .map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-slate-500 mt-1">
                      Owner accounts are not available for role changes here.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="role_change_reason" className={labelClass}>
                      Reason for Role Change *
                    </label>
                    <textarea
                      id="role_change_reason"
                      value={roleReason}
                      onChange={(event) => setRoleReason(event.target.value)}
                      className={`${inputClass} min-h-24 resize-y`}
                      placeholder="Explain why this employee's role is changing..."
                      maxLength={2000}
                      required
                    />
                  </div>

                  {roleError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 whitespace-pre-line"
                    >
                      {roleError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      roleLoading ||
                      !roleValue ||
                      roleValue === roleMember.role ||
                      !roleReason.trim()
                    }
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {roleLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Updating Role...
                      </>
                    ) : (
                      <>
                        <Shield size={17} />
                        Save Role Change
                      </>
                    )}
                  </button>
                </form>
              )}

              {!roleMember && (
                <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl">
                  <Users size={30} className="mx-auto text-slate-300 mb-3" />
                  <p className="font-medium text-slate-700">
                    Select an employee
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Their current role and role-change form will appear here.
                  </p>
                </div>
              )}
            </section>

            <section className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <History size={18} className="text-purple-600" />
                <h3 className="font-semibold text-slate-900">
                  Role Change History
                </h3>
              </div>

              {!roleMember ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  Select an employee to view their role history.
                </p>
              ) : (
                <HistoryList
                  items={roleHistory}
                  loading={roleHistoryLoading}
                  error={roleHistoryError}
                  emptyTitle="No role changes recorded."
                  emptyDescription="Future role changes will appear here."
                  renderItem={(item) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-lg p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {formatRole(item.previous_role)} → {formatRole(item.new_role)}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={12} />
                          {formatDateTime(item.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 mt-2">
                        Changed by: {item.changed_by_username || 'Unknown'}
                      </p>

                      {item.reason && (
                        <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
                          <strong>Reason:</strong> {item.reason}
                        </p>
                      )}
                    </div>
                  )}
                />
              )}
            </section>
          </div>
        </Modal>
      )}

      {/* Shift management modal */}
      {showShiftManagement && (
        <Modal
          title="Manage Staff Shifts"
          description="Assign DAY or NIGHT shifts with an effective date. Changes are recorded in the employee's shift history."
          onClose={closeShiftManagement}
          maxWidth="max-w-4xl"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="space-y-3">
              <div>
                <label htmlFor="shift_member" className={labelClass}>
                  Select Staff Member
                </label>
                <select
                  id="shift_member"
                  value={shiftMember?.id || ''}
                  onChange={(event) => {
                    const member = shiftMembers.find(
                      (item) => String(item.id) === event.target.value
                    )
                    if (member) selectShiftMember(member)
                  }}
                  className={inputClass}
                >
                  <option value="">Choose an employee</option>
                  {shiftMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.username} — {member.staff_number}
                    </option>
                  ))}
                </select>
              </div>

              {shiftMember && (
                <form onSubmit={handleShiftChange} className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="font-semibold text-slate-900">
                      {shiftMember.full_name || shiftMember.username}
                    </p>
                    <p className="text-sm text-slate-500">
                      {shiftMember.staff_number} · {shiftMember.branch_name || 'No branch'}
                    </p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Current shift</span>
                      <span className="font-semibold text-slate-800">
                        {shiftMember.current_shift || 'Not assigned'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Employment status</span>
                      <span className="font-medium text-slate-800">
                        {shiftMember.employment_status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="new_staff_shift" className={labelClass}>
                      New Shift *
                    </label>
                    <select
                      id="new_staff_shift"
                      value={shiftValue}
                      onChange={(event) => setShiftValue(event.target.value)}
                      className={inputClass}
                      required
                    >
                      <option value="DAY">Day Shift</option>
                      <option value="NIGHT">Night Shift</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="shift_effective_from" className={labelClass}>
                      Effective From *
                    </label>
                    <input
                      id="shift_effective_from"
                      type="date"
                      min={getToday()}
                      value={shiftEffectiveFrom}
                      onChange={(event) => setShiftEffectiveFrom(event.target.value)}
                      className={inputClass}
                      required
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Backdated shift changes are not allowed.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="shift_change_reason" className={labelClass}>
                      Reason for Shift Change *
                    </label>
                    <textarea
                      id="shift_change_reason"
                      value={shiftReason}
                      onChange={(event) => setShiftReason(event.target.value)}
                      className={`${inputClass} min-h-24 resize-y`}
                      placeholder="Explain why this employee's shift is changing..."
                      maxLength={2000}
                      required
                    />
                  </div>

                  {shiftError && (
                    <div
                      role="alert"
                      className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 whitespace-pre-line"
                    >
                      {shiftError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      shiftLoading ||
                      !shiftValue ||
                      shiftValue === shiftMember.current_shift ||
                      !shiftReason.trim()
                    }
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {shiftLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Updating Shift...
                      </>
                    ) : (
                      <>
                        <CalendarClock size={17} />
                        Save Shift Change
                      </>
                    )}
                  </button>
                </form>
              )}

              {!shiftMember && (
                <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl">
                  <CalendarClock size={30} className="mx-auto text-slate-300 mb-3" />
                  <p className="font-medium text-slate-700">
                    Select an employee
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Their current shift and shift-change form will appear here.
                  </p>
                </div>
              )}
            </section>

            <section className="border border-slate-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <History size={18} className="text-emerald-600" />
                <h3 className="font-semibold text-slate-900">
                  Shift Assignment History
                </h3>
              </div>

              {!shiftMember ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  Select an employee to view their shift history.
                </p>
              ) : (
                <HistoryList
                  items={shiftHistory}
                  loading={shiftHistoryLoading}
                  error={shiftHistoryError}
                  emptyTitle="No shift history available."
                  emptyDescription="Shift assignments will appear here when recorded."
                  renderItem={(item) => (
                    <div
                      key={item.id}
                      className="border border-slate-200 rounded-lg p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                          {item.shift} SHIFT
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock size={12} />
                          {formatDateTime(item.created_at)}
                        </span>
                      </div>

                      <p className="text-sm text-slate-700 mt-3">
                        <strong>Effective from:</strong> {item.effective_from}
                      </p>

                      <p className="text-sm text-slate-700 mt-1">
                        <strong>Effective to:</strong> {item.effective_to || 'Current'}
                      </p>

                      {item.reason && (
                        <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
                          <strong>Reason:</strong> {item.reason}
                        </p>
                      )}
                    </div>
                  )}
                />
              )}
            </section>
          </div>
        </Modal>
      )}

      {/* Registration modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRegistration()
          }}
        >
          <div className="bg-white w-full max-w-3xl max-h-[95vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
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

            <form onSubmit={handleRegistration} className="flex-1 overflow-y-auto">
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

      {/* Account status confirmation modal */}
      {selectedMember && currentAction && (
        <Modal
          title={currentAction.title}
          description={`${selectedMember.full_name || selectedMember.username} · ${selectedMember.staff_number}`}
          onClose={closeStatusAction}
          footer={
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={closeStatusAction}
                disabled={actionLoading}
                className="px-5 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                form="staff-status-action-form"
                disabled={actionLoading}
                className={`flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 ${currentAction.buttonClass}`}
              >
                {actionLoading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {currentAction.icon}
                    {currentAction.button}
                  </>
                )}
              </button>
            </div>
          }
        >
          <form
            id="staff-status-action-form"
            onSubmit={handleStatusAction}
            className="space-y-4"
          >
            <p className="text-sm text-slate-600">
              {currentAction.description}
            </p>

            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-slate-500">Current status</span>
                <span className="font-semibold text-slate-800">
                  {selectedMember.employment_status}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-sm mt-2">
                <span className="text-slate-500">Staff number</span>
                <span className="font-semibold text-slate-800">
                  {selectedMember.staff_number}
                </span>
              </div>
            </div>

            {currentAction.requiresReason && (
              <div>
                <label htmlFor="action_reason" className={labelClass}>
                  Reason *
                </label>
                <textarea
                  id="action_reason"
                  value={actionReason}
                  onChange={(event) => setActionReason(event.target.value)}
                  className={`${inputClass} min-h-28 resize-y`}
                  placeholder="Enter the reason for this action..."
                  maxLength={2000}
                  required
                />
              </div>
            )}

            {actionError && (
              <div
                role="alert"
                className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 whitespace-pre-line"
              >
                {actionError}
              </div>
            )}
          </form>
        </Modal>
      )}

      {/* Status history modal */}
      {historyMember && (
        <Modal
          title="Staff Account History"
          description={`${historyMember.full_name || historyMember.username} · ${historyMember.staff_number}`}
          onClose={closeHistory}
        >
          <HistoryList
            items={historyItems}
            loading={historyLoading}
            error={historyError}
            emptyTitle="No status history available."
            emptyDescription="Account actions will appear here when recorded."
            renderItem={(item) => (
              <div
                key={item.id}
                className="border border-slate-200 rounded-xl p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(
                      item.action === 'ACTIVATED'
                        ? 'ACTIVE'
                        : item.action === 'SUSPENDED'
                          ? 'SUSPENDED'
                          : 'INACTIVE'
                    )}`}
                  >
                    {getActionLabel(item.action)}
                  </span>

                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock size={13} />
                    {formatDateTime(item.created_at)}
                  </span>
                </div>

                <p className="text-sm text-slate-700 mt-3">
                  <strong>Performed by:</strong>{' '}
                  {item.performed_by_username || 'Unknown'}
                </p>

                {item.reason && (
                  <p className="text-sm text-slate-600 mt-2 whitespace-pre-line">
                    <strong>Reason:</strong> {item.reason}
                  </p>
                )}
              </div>
            )}
          />
        </Modal>
      )}
    </div>
  )
}
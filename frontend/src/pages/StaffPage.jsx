
import { useEffect, useMemo, useState } from 'react'
import {
  Users,
  Search,
  RefreshCw,
  UserPlus,
  AlertCircle,
} from 'lucide-react'

import { getStaff } from '../api/staff'

export default function StaffPage() {
  const [staff, setStaff] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadStaff = async () => {
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
        setError(
          err.response?.data?.detail ||
          'Unable to load staff members. Check that the Django server is running.'
        )
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  const filteredStaff = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return staff

    return staff.filter((member) => {
      const searchable = [
        member.staff_number,
        member.full_name,
        member.username,
        member.email,
        member.phone_number,
        member.branch_name,
        member.role,
        member.employment_status,
      ]

      return searchable.some((value) =>
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

  const statusStyle = (status) => {
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

  return (
    <div className="space-y-7">
      {/* Page heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
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
        </div>

        <button
          type="button"
          disabled
          title="Staff registration will be enabled in the next step"
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold opacity-60 cursor-not-allowed"
        >
          <UserPlus size={18} />
          Register Staff
        </button>
      </div>

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
                className="w-full sm:w-64 pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="button"
              onClick={loadStaff}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="m-5 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">{error}</p>
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
                : 'Registered employees will appear here.'}
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
                      <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusStyle(member.employment_status)}`}>
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
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
    </div>
  )
}

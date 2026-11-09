
import { LogOut, UserCircle2, Menu } from 'lucide-react'
import { useAuth } from '../../features/auth/AuthContext'

export default function Topbar({ title = 'Dashboard', onMenuClick }) {
  const { user, logout } = useAuth()

  const fullName = [
    user?.first_name,
    user?.last_name,
  ].filter(Boolean).join(' ') || user?.username || 'User'

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="h-20 bg-white border-b border-slate-200 px-5 md:px-8 flex items-center justify-between sticky top-0 z-20">

      {/* Page title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {title}
          </h2>

          <p className="text-xs text-slate-500 mt-1">
            NEV CARWASH Management
          </p>
        </div>
      </div>

      {/* User profile and logout */}
      <div className="flex items-center gap-3 md:gap-5">

        <div className="hidden sm:flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
            {initials}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">
              {fullName}
            </p>

            <p className="text-xs text-slate-500">
              {user?.role || 'Staff'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Sign out</span>
        </button>

      </div>
    </header>
  )
}

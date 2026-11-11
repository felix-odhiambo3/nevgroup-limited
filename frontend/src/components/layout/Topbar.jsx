import { LogOut, Menu } from 'lucide-react'
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
    <header className="h-20 bg-yellow-400 border-b border-yellow-500 px-5 md:px-8 flex items-center justify-between sticky top-0 z-20">

      {/* Page title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg text-black hover:text-red-600 hover:bg-yellow-300 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu size={22} />
        </button>

        <div>
          <h2 className="text-xl font-bold text-black">
            {title}
          </h2>

          <p className="text-xs text-black mt-1">
            <span className="text-red-700 font-bold">
              NEV CARWASH
            </span>
            {' '}Management
          </p>
        </div>
      </div>

      {/* User profile and logout */}
      <div className="flex items-center gap-3 md:gap-5">

        <div className="hidden sm:flex items-center gap-3">

          {/* User initials */}
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm">
            {initials}
          </div>

          {/* User details */}
          <div>
            <p className="text-sm font-semibold text-black">
              {fullName}
            </p>

            <p className="text-xs text-black/70">
              {user?.role || 'Staff'}
            </p>
          </div>

        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={logout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-black hover:text-white hover:bg-red-600 transition-colors"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Sign out</span>
        </button>

      </div>
    </header>
  )
}
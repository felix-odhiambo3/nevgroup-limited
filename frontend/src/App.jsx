
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom'

import {
  AuthProvider,
  useAuth,
} from './features/auth/AuthContext'

import {
  canAccessRoute,
  getDefaultRoute,
} from './config/rolePermissions'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StaffPage from './pages/StaffPage'
import ServicesPage from './pages/ServicesPage'
import AttendancePage from './pages/AttendancePage'
import MyAttendancePage from './pages/MyAttendancePage'
import MyDayPage from './pages/MyDayPage'
import CheckInPage from './pages/CheckInPage'
import MonitorAssignmentsPage from './pages/MonitorAssignmentsPage'
import InvoicePage from './pages/InvoicePage'

import MainLayout from './components/layout/MainLayout'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-red-600 border-t-transparent" />
        <p className="font-semibold text-slate-700">
          Loading NEV CARWASH...
        </p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    )
  }

  const allowed = canAccessRoute(user, location.pathname)

  if (!allowed) {
    return <Navigate to={getDefaultRoute(user)} replace />
  }

  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) return <LoadingScreen />

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user
            ? <Navigate to={getDefaultRoute(user)} replace />
            : <LoginPage />
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/services" element={<ServicesPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/my-attendance" element={<MyAttendancePage />} />
        <Route path="/my-day" element={<MyDayPage />} />
        <Route path="/check-in" element={<CheckInPage />} />

        <Route
          path="/monitor-assignments"
          element={<MonitorAssignmentsPage />}
        />

        <Route path="/invoices" element={<InvoicePage />} />
      </Route>

      <Route
        path="/"
        element={
          <Navigate
            to={user ? getDefaultRoute(user) : '/login'}
            replace
          />
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to={user ? getDefaultRoute(user) : '/login'}
            replace
          />
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

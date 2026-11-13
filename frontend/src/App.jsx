
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import { AuthProvider, useAuth } from './features/auth/AuthContext'

import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StaffPage from './pages/StaffPage'
import AttendancePage from './pages/AttendancePage'
import CheckInPage from './pages/CheckInPage'
import MainLayout from './components/layout/MainLayout'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="font-semibold text-slate-700">
            Loading NEV CARWASH...
          </p>
        </div>
      </div>
    )
  }

  return user ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/attendance" element={<AttendancePage />} />
        <Route path="/check-in" element={<CheckInPage />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
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

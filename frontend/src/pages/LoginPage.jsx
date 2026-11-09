
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { LockKeyhole, Mail, ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'

export default function LoginPage() {
  const { user, login, loading } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await login({
        username: username.trim(),
        password,
      })
    } catch (err) {
      const data = err.response?.data

      setError(
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.username?.[0] ||
        'Unable to sign in. Check your credentials and try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden grid md:grid-cols-2">

        {/* Branding section */}
        <section className="hidden md:flex bg-slate-950 text-white p-12 flex-col justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">
                NC
              </div>

              <div>
                <h1 className="text-xl font-bold">NEV CARWASH</h1>
                <p className="text-xs text-slate-400">
                  Carwash Operations Management
                </p>
              </div>
            </div>

            <div className="mt-24">
              <p className="text-blue-400 text-sm font-semibold uppercase tracking-widest">
                Operations management
              </p>

              <h2 className="text-4xl font-bold leading-tight mt-4">
                Manage your carwash business with confidence.
              </h2>

              <p className="text-slate-400 mt-6 leading-relaxed">
                Manage staff, attendance, vehicle visits,
                payments and business operations from one
                central platform.
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-500">
            NEV CARWASH · A Diamond Space Limited Branch
          </p>
        </section>

        {/* Login section */}
        <section className="p-8 sm:p-12 flex flex-col justify-center">
          <div className="md:hidden flex items-center gap-3 mb-12">
            <div className="w-11 h-11 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold">
              NC
            </div>

            <div>
              <h1 className="font-bold text-lg">NEV CARWASH</h1>
              <p className="text-xs text-slate-500">
                Carwash Operations Management
              </p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">
              Welcome back
            </h2>

            <p className="text-slate-500 mt-2">
              Sign in to access your NEV CARWASH management dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Username or email
              </label>

              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={19}
                />

                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username or email"
                  className="w-full rounded-xl border border-slate-200 py-3.5 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>

              <div className="relative">
                <LockKeyhole
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={19}
                />

                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-200 py-3.5 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={19} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={19} />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-10">
            Authorized NEV CARWASH personnel only.
          </p>

          <p className="text-center text-xs text-slate-400 mt-2">
            Powered by Diamond Space Limited
          </p>
        </section>
      </div>
    </main>
  )
}

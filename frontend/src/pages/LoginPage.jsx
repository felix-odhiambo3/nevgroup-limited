import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  LockKeyhole,
  Mail,
  ArrowRight,
  Loader2,
} from 'lucide-react'
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
        <Loader2 className="animate-spin text-red-600" size={32} />
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
    <main
      className="min-h-screen flex items-center justify-center p-5 bg-cover bg-center bg-no-repeat relative"
      style={{ backgroundImage: "url('/login-bg.jpeg')" }}
    >

      {/* Background overlay */}
      <div className="absolute inset-0 bg-black/30"></div>

      {/* Main glass container */}
      <div className="relative z-10 w-full max-w-5xl rounded-3xl overflow-hidden grid md:grid-cols-2 border-2 border-white/30 backdrop-blur-md shadow-2xl">

        {/* Branding section */}
        <section className="hidden md:flex bg-white/60 p-12 flex-col justify-between border-r border-white/40">

          <div>
            <div className="flex items-center gap-3">

              <div className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden">
                <img
                  src="/favicon.svg"
                  alt="NEV CARWASH Logo"
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <h1 className="text-xl font-bold text-red-600">
                  NEV CARWASH
                </h1>
                <p className="text-xs text-black">
                  Carwash Operations Management
                </p>
              </div>

            </div>

            <div className="mt-24">

              <p className="text-red-600 text-sm font-semibold uppercase tracking-widest">
                Operations management
              </p>

              <h2 className="text-4xl font-bold leading-tight mt-4 text-black">
                Manage your carwash business with confidence.
              </h2>

              <p className="text-black mt-6 leading-relaxed">
                Manage staff, attendance, vehicle visits,
                payments and business operations from one
                central platform.
              </p>

            </div>
          </div>

          <p className="text-sm text-black">
            <span className="text-red-600 font-bold">NEV CARWASH</span>
            {' '}is a product of{' '}
            <span className="text-red-600 font-bold">NEVGROUP</span>
          </p>

        </section>

        {/* Login section */}
        <section className="relative bg-white/60 p-8 sm:p-12 flex flex-col justify-center">

          {/* Mobile branding */}
          <div className="md:hidden flex items-center gap-3 mb-10">

            <div className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center">
              <img
                src="/favicon.svg"
                alt="NEV CARWASH Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <div>
              <h1 className="font-bold text-lg text-red-600">
                NEV CARWASH
              </h1>
              <p className="text-xs text-black">
                Carwash Operations Management
              </p>
            </div>

          </div>

          {/* Login heading */}
          <div className="mb-8 text-center">

            <h2 className="text-3xl font-bold text-black">
              Login
            </h2>

            <p className="text-black mt-2 text-sm">
              Sign in to access your{' '}
              <span className="text-red-600 font-semibold">
                NEV CARWASH
              </span>
              {' '}dashboard.
            </p>

          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Username */}
            <div className="relative w-full h-14">

              <input
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username or email"
                className="w-full h-full bg-white/20 border-2 border-black/20 rounded-full text-black text-base outline-none px-5 pr-14 placeholder:text-black/60 focus:border-red-600 transition-colors"
              />

              <Mail
                className="absolute right-5 top-1/2 -translate-y-1/2 text-black"
                size={20}
              />

            </div>

            {/* Password */}
            <div className="relative w-full h-14">

              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full h-full bg-white/20 border-2 border-black/20 rounded-full text-black text-base outline-none px-5 pr-14 placeholder:text-black/60 focus:border-red-600 transition-colors"
              />

              <LockKeyhole
                className="absolute right-5 top-1/2 -translate-y-1/2 text-black"
                size={20}
              />

            </div>

            {/* Remember me and Forgot password */}
            <div className="flex items-center justify-between gap-3 text-xs sm:text-sm -mt-1">

              <label className="flex items-center gap-2 cursor-pointer text-black">

                <input
                  type="checkbox"
                  className="accent-red-600 w-4 h-4"
                />

                Remember Me

              </label>

              <button
                type="button"
                className="text-black hover:text-red-600 transition-colors"
                title="Password recovery is not yet configured"
              >
                Forgot Password?
              </button>

            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                className="bg-red-100/80 border border-red-300 text-red-700 text-sm p-3 rounded-xl"
              >
                {error}
              </div>
            )}

            {/* Login button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 bg-white hover:bg-red-600 hover:text-white disabled:opacity-60 text-black font-bold rounded-full flex items-center justify-center gap-2 transition-all shadow-lg"
            >

              {submitting ? (
                <>
                  <Loader2 size={19} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Login
                  <ArrowRight size={19} />
                </>
              )}

            </button>

          </form>

          {/* Footer */}
          <div className="text-center mt-10 space-y-2">

            <p className="text-xs text-black">
              Authorized{' '}
              <span className="text-red-600 font-semibold">
                NEV CARWASH
              </span>
              {' '}personnel only.
            </p>

            <p className="text-xs text-black">
              Powered by{' '}
              <span className="text-red-600 font-semibold">
                NEVGROUP
              </span>
            </p>

          </div>

        </section>

      </div>

    </main>
  )
}

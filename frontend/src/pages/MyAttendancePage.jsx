
import { useCallback, useEffect, useState } from 'react'

import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'

import {
  getMyAttendance,
  clockInAttendance,
  clockOutAttendance,
} from '../api/attendance'


function formatDateTime(value) {
  if (!value) return 'Not recorded'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Not available'
  }

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}


function formatWorkDate(value) {
  if (!value) return 'Not available'

  const date = new Date(`${value}T00:00:00`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'full',
    timeZone: 'Africa/Nairobi',
  }).format(date)
}


function getErrorMessage(error) {
  const responseData = error?.response?.data

  if (typeof responseData?.detail === 'string') {
    return responseData.detail
  }

  if (typeof responseData === 'string') {
    return responseData
  }

  if (responseData && typeof responseData === 'object') {
    const messages = Object.values(responseData)
      .flat(Infinity)
      .filter((item) => typeof item === 'string')

    if (messages.length) {
      return messages.join(' ')
    }
  }

  if (error?.message) {
    return error.message
  }

  return 'Something went wrong. Please try again.'
}


function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(
        new Error(
          'Location access requires a secure connection (HTTPS).'
        )
      )
      return
    }

    if (!navigator.geolocation) {
      reject(
        new Error(
          'Your browser does not support location services.'
        )
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },

      (error) => {
        let message = 'Unable to obtain your location.'

        if (error.code === 1) {
          message =
            'Location permission was denied. Allow location access in your browser settings and try again.'
        } else if (error.code === 2) {
          message =
            'Your current location is unavailable. Check your device GPS and try again.'
        } else if (error.code === 3) {
          message =
            'Location request timed out. Move to an area with a clearer GPS signal and try again.'
        }

        reject(new Error(message))
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  })
}


function StatusPill({ clockedIn }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${
        clockedIn
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-slate-100 text-slate-600'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          clockedIn ? 'bg-emerald-500' : 'bg-slate-400'
        }`}
      />

      {clockedIn ? 'Currently clocked in' : 'Not clocked in'}
    </span>
  )
}


function InformationCard({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-slate-500">
        <Icon size={17} />
        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="break-words text-sm font-bold text-slate-800">
        {value || 'Not available'}
      </p>
    </div>
  )
}


export default function MyAttendancePage() {
  const [attendanceState, setAttendanceState] = useState(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [notice, setNotice] = useState(null)
  const [lastAccuracy, setLastAccuracy] = useState(null)

  const loadAttendance = useCallback(async () => {
    setStatusLoading(true)
    setStatusError('')

    try {
      const result = await getMyAttendance()
      setAttendanceState(result)
    } catch (error) {
      setStatusError(getErrorMessage(error))
      setAttendanceState(null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAttendance()
  }, [loadAttendance])

  const handleAttendanceAction = async (action) => {
    if (actionLoading || statusLoading) return

    setActionLoading(action)
    setNotice(null)
    setLastAccuracy(null)

    try {
      // GPS is requested only after the employee presses a button.
      const location = await getBrowserLocation()

      setLastAccuracy(location.accuracy)

      const result = action === 'CLOCK_IN'
        ? await clockInAttendance(location)
        : await clockOutAttendance(location)

      setAttendanceState({
        is_clocked_in: result.is_clocked_in,
        attendance: result.attendance,
      })

      setNotice({
        type: 'success',
        message: result.detail || (
          action === 'CLOCK_IN'
            ? 'You have successfully clocked in.'
            : 'You have successfully clocked out.'
        ),
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: getErrorMessage(error),
      })
    } finally {
      setActionLoading(null)
    }
  }

  const clockedIn = attendanceState?.is_clocked_in === true
  const record = attendanceState?.attendance

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">

      {/* NEV CARWASH page heading */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-red-950 shadow-lg">
        <div className="relative p-6 sm:p-8">
          <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full border-[35px] border-white/5" />

          <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold tracking-wider text-red-200">
                <Clock size={14} />
                EMPLOYEE ATTENDANCE
              </div>

              <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                My Attendance
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                Record your shift attendance securely using your
                device location at the branch.
              </p>
            </div>

            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-red-300">
              <Clock3 size={34} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-black/10 px-6 py-3 text-xs text-slate-300 sm:px-8">
          <span className="flex items-center gap-2">
            <ShieldCheck size={15} />
            GPS-verified attendance
          </span>

          <span className="hidden text-slate-600 sm:inline">•</span>

          <span className="flex items-center gap-2">
            <MapPin size={15} />
            Branch location verification
          </span>
        </div>
      </section>

      {/* Status loading */}
      {statusLoading && (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white p-10">
          <div className="text-center">
            <Loader2
              size={30}
              className="mx-auto animate-spin text-red-600"
            />

            <p className="mt-3 text-sm font-semibold text-slate-600">
              Loading your attendance...
            </p>
          </div>
        </div>
      )}

      {/* Status loading error */}
      {!statusLoading && statusError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              size={22}
              className="mt-0.5 shrink-0 text-red-600"
            />

            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-red-900">
                Attendance information unavailable
              </h2>

              <p className="mt-2 text-sm leading-6 text-red-800">
                {statusError}
              </p>

              <button
                type="button"
                onClick={loadAttendance}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                <RefreshCw size={16} />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main attendance content */}
      {!statusLoading && !statusError && attendanceState && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  Your current status
                </p>

                <div className="mt-3">
                  <StatusPill clockedIn={clockedIn} />
                </div>
              </div>

              <button
                type="button"
                onClick={loadAttendance}
                disabled={statusLoading || Boolean(actionLoading)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={16} />
                Refresh status
              </button>
            </div>

            <div className="my-6 border-t border-slate-100" />

            {clockedIn && record ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InformationCard
                  icon={Building2}
                  label="Branch"
                  value={record.branch_name}
                />

                <InformationCard
                  icon={CalendarDays}
                  label="Shift"
                  value={record.shift_type}
                />

                <InformationCard
                  icon={Clock}
                  label="Clock-in time"
                  value={formatDateTime(record.clock_in)}
                />

                <InformationCard
                  icon={CalendarDays}
                  label="Work date"
                  value={formatWorkDate(record.work_date)}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <Clock size={27} />
                </div>

                <h2 className="mt-4 text-lg font-bold text-slate-900">
                  Ready to start your shift?
                </h2>

                <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
                  When you are at your assigned branch, press
                  Clock In. Your browser will request your current
                  location for verification.
                </p>
              </div>
            )}
          </section>

          {/* Clock-in / Clock-out action */}
          <section className="grid gap-5 lg:grid-cols-2">

            <div className={`rounded-2xl border p-6 shadow-sm ${
              !clockedIn
                ? 'border-red-200 bg-white'
                : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-700">
                <LogIn size={24} />
              </div>

              <h2 className="mt-5 text-xl font-extrabold text-slate-900">
                Clock In
              </h2>

              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                Record the beginning of your assigned shift after
                your branch location has been verified.
              </p>

              <button
                type="button"
                onClick={() => handleAttendanceAction('CLOCK_IN')}
                disabled={clockedIn || Boolean(actionLoading)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
              >
                {actionLoading === 'CLOCK_IN' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Verifying location...
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    Clock In
                  </>
                )}
              </button>

              {clockedIn && (
                <p className="mt-3 text-center text-xs font-medium text-slate-500">
                  You are already clocked in.
                </p>
              )}
            </div>

            <div className={`rounded-2xl border p-6 shadow-sm ${
              clockedIn
                ? 'border-emerald-200 bg-white'
                : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <LogOut size={24} />
              </div>

              <h2 className="mt-5 text-xl font-extrabold text-slate-900">
                Clock Out
              </h2>

              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">
                Record the end of your shift. Your location will
                be verified again before checkout is completed.
              </p>

              <button
                type="button"
                onClick={() => handleAttendanceAction('CLOCK_OUT')}
                disabled={!clockedIn || Boolean(actionLoading)}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
              >
                {actionLoading === 'CLOCK_OUT' ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Verifying location...
                  </>
                ) : (
                  <>
                    <LogOut size={18} />
                    Clock Out
                  </>
                )}
              </button>

              {!clockedIn && (
                <p className="mt-3 text-center text-xs font-medium text-slate-500">
                  You must clock in before clocking out.
                </p>
              )}
            </div>
          </section>

          {/* Latest action feedback */}
          {notice && (
            <div className={`rounded-xl border p-4 ${
              notice.type === 'success'
                ? 'border-emerald-200 bg-emerald-50'
                : 'border-red-200 bg-red-50'
            }`}>
              <div className="flex items-start gap-3">
                {notice.type === 'success' ? (
                  <CheckCircle2
                    size={21}
                    className="mt-0.5 shrink-0 text-emerald-600"
                  />
                ) : (
                  <AlertTriangle
                    size={21}
                    className="mt-0.5 shrink-0 text-red-600"
                  />
                )}

                <div>
                  <p className={`text-sm font-bold ${
                    notice.type === 'success'
                      ? 'text-emerald-900'
                      : 'text-red-900'
                  }`}>
                    {notice.type === 'success'
                      ? 'Attendance update'
                      : 'Attendance action unsuccessful'}
                  </p>

                  <p className={`mt-1 text-sm leading-6 ${
                    notice.type === 'success'
                      ? 'text-emerald-800'
                      : 'text-red-800'
                  }`}>
                    {notice.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Latest GPS accuracy */}
          {lastAccuracy !== null && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Navigation
                  size={20}
                  className="mt-0.5 shrink-0 text-blue-700"
                />

                <div>
                  <p className="text-sm font-bold text-blue-900">
                    GPS reading captured
                  </p>

                  <p className="mt-1 text-sm text-blue-800">
                    Reported location accuracy: approximately{' '}
                    {Math.round(lastAccuracy)} metres.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* GPS policy */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <ShieldCheck size={21} />
          </div>

          <div>
            <h3 className="font-bold text-slate-900">
              Attendance location verification
            </h3>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              NEV CARWASH captures your device location only when
              you request Clock In or Clock Out. The server checks
              that your GPS accuracy is within 50 metres and that
              your position is inside your branch's configured
              attendance radius.
            </p>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Location is not continuously tracked in the
              background. Do not close the attendance page before
              the server confirms your action.
            </p>
          </div>
        </div>
      </section>

    </div>
  )
}

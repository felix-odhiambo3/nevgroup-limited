
import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CarFront,
  CheckCircle2,
  Loader2,
  Search,
  UserPlus,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'
import {
  getVehicles,
  registerVehicle,
  getCustomers,
} from '../api/vehicles'
import { createVisit } from '../api/visits'
import { getBranches } from '../api/branches'
import { getMyStaffProfile } from '../api/staffOperations'

const VEHICLE_TYPES = [
  { value: 'SALOON', label: 'Saloon' },
  { value: 'SUV', label: 'SUV' },
  { value: 'PICKUP', label: 'Pickup' },
  { value: 'VAN', label: 'Van' },
  { value: 'TRUCK', label: 'Truck' },
  { value: 'MOTORCYCLE', label: 'Motorcycle' },
  { value: 'OTHER', label: 'Other' },
]

const canCreateVehicle = (role) =>
  ['ADMIN', 'SUPERVISOR', 'DETAILER'].includes(role)

const canCreateVisit = (role) =>
  ['ADMIN', 'OWNER', 'SUPERVISOR', 'DETAILER'].includes(role)

const canChooseBranch = (role) =>
  ['ADMIN', 'OWNER'].includes(role)

const canViewCustomers = (role) =>
  ['ADMIN', 'OWNER', 'SUPERVISOR'].includes(role)

const getErrorMessage = (error) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (data?.detail) return data.detail

  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, messages]) => {
        const message = Array.isArray(messages)
          ? messages.join(' ')
          : String(messages)

        return `${field}: ${message}`
      })
      .join(' ')
  }

  return error?.message || 'Something went wrong. Please try again.'
}

const getBranchId = (profile) => {
  if (!profile?.branch) return ''
  if (typeof profile.branch === 'object') return profile.branch.id
  return profile.branch
}

const emptyVehicle = {
  registration_number: '',
  vehicle_type: 'SALOON',
  no_plastic_mat: false,
  no_woolen_mat: false,
  special_concerns: '',
}

export default function CheckInPage() {
  const { user } = useAuth()
  const role = user?.role

  const [vehicles, setVehicles] = useState([])
  const [customers, setCustomers] = useState([])
  const [branches, setBranches] = useState([])
  const [staffProfile, setStaffProfile] = useState(null)

  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [savingVisit, setSavingVisit] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState(null)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [registrationBranchId, setRegistrationBranchId] = useState('')
  const [servicingBranchId, setServicingBranchId] = useState('')
  const [notes, setNotes] = useState('')

  const [newVehicle, setNewVehicle] = useState(emptyVehicle)

  const normalizedSearch = search.trim()

  const showRegistrationForm =
    canCreateVehicle(role) &&
    normalizedSearch.length >= 2 &&
    !searching &&
    vehicles.length === 0 &&
    !selectedVehicle

  // Load customers, branches and staff profile.
  useEffect(() => {
    let active = true

    const loadInitialData = async () => {
      setLoading(true)
      setError('')

      try {
        const requests = []

        if (canViewCustomers(role)) {
          requests.push(getCustomers())
        }

        if (canChooseBranch(role)) {
          requests.push(getBranches())
        }

        if (['SUPERVISOR', 'DETAILER'].includes(role)) {
          requests.push(getMyStaffProfile())
        }

        const results = await Promise.all(requests)

        if (!active) return

        let index = 0

        if (canViewCustomers(role)) {
          setCustomers(results[index++] || [])
        }

        if (canChooseBranch(role)) {
          setBranches(results[index++] || [])
        }

        if (['SUPERVISOR', 'DETAILER'].includes(role)) {
          const profile = results[index]
          setStaffProfile(profile)

          const ownBranchId = getBranchId(profile)

          if (ownBranchId) {
            setRegistrationBranchId(String(ownBranchId))
            setServicingBranchId(String(ownBranchId))
          }
        }
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError))
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    if (role) loadInitialData()

    return () => {
      active = false
    }
  }, [role])

  // Search the backend as the user types.
  // The short delay prevents a request for every keystroke.
  useEffect(() => {
    let active = true

    if (normalizedSearch.length < 2 || selectedVehicle) {
      setVehicles([])
      setSearching(false)

      return () => {
        active = false
      }
    }

    setSearching(true)

    const timeoutId = setTimeout(async () => {
      try {
        const results = await getVehicles({
          search: normalizedSearch,
        })

        if (active) {
          setVehicles(results)
        }
      } catch (searchError) {
        if (active) {
          setVehicles([])
          setError(getErrorMessage(searchError))
        }
      } finally {
        if (active) setSearching(false)
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [normalizedSearch, selectedVehicle])

  const updateNewVehicle = (field, value) => {
    setNewVehicle((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleSearchChange = (value) => {
    setSearch(value)
    setSelectedVehicle(null)
    setError('')
    setSuccess('')

    setNewVehicle((current) => ({
      ...current,
      registration_number: value.toUpperCase(),
    }))
  }

  const handleSelectVehicle = (vehicle) => {
    if (!vehicle.is_active) {
      setError(
        'This vehicle is inactive. An administrator must reactivate it before a new visit can be created.'
      )
      return
    }

    setSelectedVehicle(vehicle)
    setSearch(vehicle.registration_number)
    setError('')
    setSuccess('')
  }

  const handleRegisterVehicle = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!canCreateVehicle(role)) {
      setError('Your account does not have permission to register vehicles.')
      return
    }

    const branchId = canChooseBranch(role)
      ? registrationBranchId
      : getBranchId(staffProfile)

    if (!branchId) {
      setError('Select or confirm the vehicle registration branch.')
      return
    }

    const registrationNumber =
      newVehicle.registration_number.trim().toUpperCase()

    if (!registrationNumber) {
      setError('Enter the vehicle registration number.')
      return
    }

    setSavingVehicle(true)

    try {
      const payload = {
        ...newVehicle,
        registration_number: registrationNumber,
        branch: Number(branchId),
        customer: selectedCustomerId
          ? Number(selectedCustomerId)
          : null,
      }

      const createdVehicle = await registerVehicle(payload)

      setSelectedVehicle(createdVehicle)
      setSearch(createdVehicle.registration_number)
      setVehicles([createdVehicle])

      setNewVehicle(emptyVehicle)

      setSuccess(
        `${createdVehicle.registration_number} registered successfully. You can now create its visit.`
      )
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSavingVehicle(false)
    }
  }

  const handleCreateVisit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!canCreateVisit(role)) {
      setError('Your account does not have permission to create visits.')
      return
    }

    if (!selectedVehicle) {
      setError('Select an active vehicle before creating a visit.')
      return
    }

    if (canChooseBranch(role) && !servicingBranchId) {
      setError('Select the branch where this vehicle is being serviced.')
      return
    }

    setSavingVisit(true)

    try {
      const payload = {
        vehicle: Number(selectedVehicle.id),
        notes: notes.trim(),
      }

      if (canChooseBranch(role)) {
        payload.branch = Number(servicingBranchId)
      }

      const createdVisit = await createVisit(payload)

      setSuccess(
        `Visit #${createdVisit.id} created successfully for ${selectedVehicle.registration_number}.`
      )

      setNotes('')
      setSelectedVehicle(null)
      setSearch('')
      setVehicles([])
      setSelectedCustomerId('')
      setNewVehicle(emptyVehicle)
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSavingVisit(false)
    }
  }

  if (!canCreateVisit(role)) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="font-semibold text-amber-900">
          Access restricted
        </h2>
        <p className="mt-2 text-sm text-amber-800">
          Your account role does not have permission to create vehicle visits.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-600">
        <Loader2 className="mr-3 animate-spin" size={22} />
        Loading check-in information...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <CarFront size={25} />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              NEV CARWASH Check-in
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Find an existing vehicle or register a new one, then record its arrival.
            </p>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {/* VEHICLE SEARCH AND INLINE REGISTRATION */}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            1. Identify vehicle
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Start typing the registration number. Existing vehicles will appear automatically.
          </p>
        </div>

        <label className="mb-2 block text-sm font-medium text-slate-700">
          Vehicle registration
        </label>

        <div className="relative">
          <Search
            size={19}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            autoComplete="off"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Start typing, e.g. KDA..."
            className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-12 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />

          {searching && (
            <Loader2
              size={19}
              className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-600"
            />
          )}
        </div>

        {!selectedVehicle &&
          normalizedSearch.length > 0 &&
          normalizedSearch.length < 2 && (
            <p className="mt-2 text-xs text-slate-500">
              Type at least two characters to search.
            </p>
          )}

        {!selectedVehicle &&
          normalizedSearch.length >= 2 &&
          searching && (
            <p className="mt-3 text-sm text-slate-500">
              Searching registered vehicles...
            </p>
          )}

        {!selectedVehicle &&
          !searching &&
          vehicles.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Matching vehicles
                </p>
              </div>

              {vehicles.slice(0, 20).map((vehicle) => (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => handleSelectVehicle(vehicle)}
                  disabled={!vehicle.is_active}
                  className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 ${
                    vehicle.is_active
                      ? 'hover:bg-blue-50'
                      : 'cursor-not-allowed bg-slate-50 opacity-60'
                  }`}
                >
                  <span>
                    <span className="block font-semibold text-slate-900">
                      {vehicle.registration_number}
                    </span>
                    <span className="text-xs text-slate-500">
                      {vehicle.vehicle_type}
                      {vehicle.branch_name
                        ? ` · Registered at ${vehicle.branch_name}`
                        : ''}
                    </span>
                  </span>

                  <span className="text-right">
                    {vehicle.is_active ? (
                      <span className="text-xs font-semibold text-blue-700">
                        Select vehicle
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-red-600">
                        Inactive
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}

        {selectedVehicle && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                  Vehicle selected
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {selectedVehicle.registration_number}
                </p>
                <p className="text-sm text-slate-600">
                  {selectedVehicle.vehicle_type}
                </p>
                {selectedVehicle.customer_name && (
                  <p className="mt-1 text-sm text-slate-600">
                    Customer: {selectedVehicle.customer_name}
                  </p>
                )}
                {selectedVehicle.branch_name && (
                  <p className="text-xs text-slate-500">
                    Registration branch: {selectedVehicle.branch_name}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedVehicle(null)
                  setSearch('')
                  setVehicles([])
                }}
                className="text-sm font-semibold text-blue-700 hover:text-blue-900"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* INLINE REGISTRATION: appears automatically when no match exists */}

        {showRegistrationForm && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                <UserPlus size={20} />
              </div>

              <div>
                <h3 className="font-semibold text-slate-900">
                  No matching vehicle found
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Register this vehicle below. The registration number has already been filled in.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegisterVehicle} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Registration number *
                  </label>
                  <input
                    required
                    value={newVehicle.registration_number}
                    onChange={(event) =>
                      updateNewVehicle(
                        'registration_number',
                        event.target.value.toUpperCase()
                      )
                    }
                    placeholder="KDA 123A"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 uppercase outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Vehicle type *
                  </label>
                  <select
                    required
                    value={newVehicle.vehicle_type}
                    onChange={(event) =>
                      updateNewVehicle('vehicle_type', event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                  >
                    {VEHICLE_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                {canChooseBranch(role) && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Vehicle registration branch *
                    </label>
                    <select
                      required
                      value={registrationBranchId}
                      onChange={(event) =>
                        setRegistrationBranchId(event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                    >
                      <option value="">Select branch</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {canViewCustomers(role) && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Customer (optional)
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(event) =>
                        setSelectedCustomerId(event.target.value)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                    >
                      <option value="">No customer selected</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.full_name} — {customer.phone_number}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newVehicle.no_plastic_mat}
                    onChange={(event) =>
                      updateNewVehicle(
                        'no_plastic_mat',
                        event.target.checked
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  No plastic mat
                </label>

                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newVehicle.no_woolen_mat}
                    onChange={(event) =>
                      updateNewVehicle(
                        'no_woolen_mat',
                        event.target.checked
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  No woolen mat
                </label>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Special concerns
                </label>
                <textarea
                  rows={3}
                  value={newVehicle.special_concerns}
                  onChange={(event) =>
                    updateNewVehicle(
                      'special_concerns',
                      event.target.value
                    )
                  }
                  placeholder="Optional vehicle notes or customer instructions"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingVehicle}
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingVehicle && (
                  <Loader2 size={17} className="mr-2 animate-spin" />
                )}
                {savingVehicle
                  ? 'Registering vehicle...'
                  : 'Register and select vehicle'}
              </button>
            </form>
          </div>
        )}

        {!selectedVehicle &&
          !searching &&
          normalizedSearch.length >= 2 &&
          vehicles.length > 0 &&
          vehicles.every((vehicle) => !vehicle.is_active) && (
            <p className="mt-3 text-sm text-amber-700">
              Matching records exist, but they are inactive. Ask an administrator to reactivate the correct vehicle instead of registering a duplicate.
            </p>
          )}

        {!selectedVehicle &&
          !searching &&
          normalizedSearch.length >= 2 &&
          vehicles.length > 0 &&
          vehicles.some((vehicle) => vehicle.is_active) && (
            <p className="mt-2 text-xs text-slate-500">
              Select the correct vehicle from the matching results above.
            </p>
          )}
      </section>

      {/* VISIT CREATION */}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            2. Create vehicle visit
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Record the branch where the vehicle is being serviced today.
          </p>
        </div>

        <form onSubmit={handleCreateVisit} className="space-y-4">
          {canChooseBranch(role) && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Servicing branch *
              </label>
              <select
                required
                value={servicingBranchId}
                onChange={(event) =>
                  setServicingBranchId(event.target.value)
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
              >
                <option value="">Select servicing branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {['SUPERVISOR', 'DETAILER'].includes(role) && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Servicing branch:{' '}
              <strong>
                {staffProfile?.branch_name || 'Your assigned branch'}
              </strong>
              <span className="ml-1 text-xs text-slate-500">
                (from your staff profile)
              </span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Visit notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes for this visit"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </div>

          {selectedVehicle && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Ready to create a visit for{' '}
              <strong>{selectedVehicle.registration_number}</strong>.
            </div>
          )}

          <button
            type="submit"
            disabled={savingVisit || !selectedVehicle}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingVisit && (
              <Loader2 size={17} className="mr-2 animate-spin" />
            )}
            {savingVisit ? 'Creating visit...' : 'Create visit'}
          </button>
        </form>
      </section>
    </div>
  )
}

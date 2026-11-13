
import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  CarFront,
  CheckCircle2,
  Loader2,
  Plus,
  Search,
  UserPlus,
  X,
  ArrowDown,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'
import {
  getVehicles,
  registerVehicle,
  getCustomers,
  getVehicleCategories,
  createVehicleCategory,
} from '../api/vehicles'
import { createVisit } from '../api/visits'
import { getBranches } from '../api/branches'
import { getMyStaffProfile } from '../api/staffOperations'

const canCreateVehicle = (role) =>
  ['ADMIN', 'SUPERVISOR', 'DETAILER'].includes(role)

const canCreateVisit = (role) =>
  ['ADMIN', 'OWNER', 'SUPERVISOR', 'DETAILER'].includes(role)

const canChooseBranch = (role) =>
  ['ADMIN', 'OWNER'].includes(role)

const canViewCustomers = (role) =>
  ['ADMIN', 'OWNER', 'SUPERVISOR'].includes(role)

const canCreateCategory = (role) =>
  ['ADMIN', 'SUPERVISOR'].includes(role)

const normalizeRegistration = (value) =>
  String(value ?? '').replace(/\s+/g, '').toUpperCase()

const normalizeVehicleInstruction = (checked) =>
  checked ? 'Yes' : ''

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
  if (typeof profile.branch === 'object') return profile.branch.id || ''
  return profile.branch
}

const emptyVehicle = {
  registration_number: '',
  make_model: '',
  category: '',
  no_plastic_mat: false,
  no_woolen_mat: false,
  special_concerns: '',
}

export default function CheckInPage() {
  const { user } = useAuth()
  const role = user?.role

  const visitSectionRef = useRef(null)

  const [vehicles, setVehicles] = useState([])
  const [customers, setCustomers] = useState([])
  const [branches, setBranches] = useState([])
  const [categories, setCategories] = useState([])
  const [staffProfile, setStaffProfile] = useState(null)

  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [searchingModels, setSearchingModels] = useState(false)
  const [savingVehicle, setSavingVehicle] = useState(false)
  const [savingVisit, setSavingVisit] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [search, setSearch] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [justRegisteredVehicle, setJustRegisteredVehicle] = useState(null)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [registrationBranchId, setRegistrationBranchId] = useState('')
  const [servicingBranchId, setServicingBranchId] = useState('')

  const [plasticMatCount, setPlasticMatCount] = useState('0')
  const [woolenMatCount, setWoolenMatCount] = useState('0')
  const [comment, setComment] = useState('')

  const [newVehicle, setNewVehicle] = useState(emptyVehicle)

  const [makeModelSuggestions, setMakeModelSuggestions] = useState([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  const normalizedSearch = normalizeRegistration(search)
  const ownBranchId = getBranchId(staffProfile)
  const ownBranchName = staffProfile?.branch_name || ''

  const showRegistrationForm =
    canCreateVehicle(role) &&
    normalizedSearch.length >= 2 &&
    !searching &&
    vehicles.length === 0 &&
    !selectedVehicle

  const scrollToVisitSection = () => {
    visitSectionRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  useEffect(() => {
    let active = true

    const loadInitialData = async () => {
      setLoading(true)
      setError('')

      try {
        const requests = [getVehicleCategories()]

        if (canViewCustomers(role)) requests.push(getCustomers())
        if (canChooseBranch(role)) requests.push(getBranches())

        if (['SUPERVISOR', 'DETAILER'].includes(role)) {
          requests.push(getMyStaffProfile())
        }

        const results = await Promise.all(requests)

        if (!active) return

        let index = 0
        setCategories(results[index++] || [])

        if (canViewCustomers(role)) {
          setCustomers(results[index++] || [])
        }

        if (canChooseBranch(role)) {
          setBranches(results[index++] || [])
        }

        if (['SUPERVISOR', 'DETAILER'].includes(role)) {
          const profile = results[index]
          setStaffProfile(profile)

          const branchId = getBranchId(profile)

          if (branchId) {
            setRegistrationBranchId(String(branchId))
            setServicingBranchId(String(branchId))
          } else {
            setError(
              'Your staff profile has no assigned branch. Ask an administrator to assign your branch before registering vehicles or creating visits.'
            )
          }
        }
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError))
      } finally {
        if (active) setLoading(false)
      }
    }

    if (role) loadInitialData()

    return () => {
      active = false
    }
  }, [role])

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
        const results = await getVehicles({ search: normalizedSearch })

        if (active) setVehicles(results)
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

  useEffect(() => {
    let active = true
    const makeModel = newVehicle.make_model.trim()

    if (makeModel.length < 2) {
      setMakeModelSuggestions([])
      setSearchingModels(false)

      return () => {
        active = false
      }
    }

    setSearchingModels(true)

    const timeoutId = setTimeout(async () => {
      try {
        const results = await getVehicles({ search: makeModel })

        if (active) {
          const uniqueModels = [
            ...new Set(
              results
                .map((vehicle) => vehicle.make_model?.trim())
                .filter(Boolean)
            ),
          ]

          setMakeModelSuggestions(uniqueModels.slice(0, 15))
        }
      } catch {
        if (active) setMakeModelSuggestions([])
      } finally {
        if (active) setSearchingModels(false)
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [newVehicle.make_model])

  const updateNewVehicle = (field, value) => {
    setNewVehicle((current) => ({
      ...current,
      [field]:
        field === 'registration_number'
          ? normalizeRegistration(value)
          : value,
    }))
  }

  const handleSearchChange = (value) => {
    const registration = normalizeRegistration(value)

    setSearch(registration)
    setSelectedVehicle(null)
    setJustRegisteredVehicle(null)
    setError('')
    setSuccess('')

    setNewVehicle((current) => ({
      ...current,
      registration_number: registration,
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
    setJustRegisteredVehicle(null)
    setSearch(normalizeRegistration(vehicle.registration_number))
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
      : ownBranchId

    if (!branchId) {
      setError(
        'Your registration branch could not be identified. Ask an administrator to check your staff profile.'
      )
      return
    }

    const registrationNumber = normalizeRegistration(
      newVehicle.registration_number
    )
    const makeModel = newVehicle.make_model.trim()
    const categoryId = newVehicle.category

    if (!registrationNumber) {
      setError('Enter the vehicle registration number.')
      return
    }

    if (!makeModel) {
      setError('Enter the vehicle make and model.')
      return
    }

    if (!categoryId) {
      setError('Select a vehicle category.')
      return
    }

    setSavingVehicle(true)

    try {
      const payload = {
        registration_number: registrationNumber,
        make_model: makeModel,
        category: Number(categoryId),

        no_plastic_mat: normalizeVehicleInstruction(
          newVehicle.no_plastic_mat
        ),
        no_woolen_mat: normalizeVehicleInstruction(
          newVehicle.no_woolen_mat
        ),

        special_concerns: newVehicle.special_concerns.trim(),
        branch: Number(branchId),
        customer: selectedCustomerId
          ? Number(selectedCustomerId)
          : null,
      }

      const createdVehicle = await registerVehicle(payload)

      setSelectedVehicle(createdVehicle)
      setJustRegisteredVehicle(createdVehicle)
      setSearch(normalizeRegistration(createdVehicle.registration_number))
      setVehicles([createdVehicle])

      setNewVehicle(emptyVehicle)
      setSelectedCustomerId('')
      setShowCategoryForm(false)
      setNewCategoryName('')

      setSuccess(
        `${createdVehicle.registration_number} registered successfully. Continue below to create its visit.`
      )

      // Move directly to the visit form after registration.
      window.requestAnimationFrame(() => {
        visitSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      })
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSavingVehicle(false)
    }
  }

  const handleCreateCategory = async () => {
    setError('')
    setSuccess('')

    if (!canCreateCategory(role)) {
      setError('Only ADMIN and SUPERVISOR can create vehicle categories.')
      return
    }

    const name = newCategoryName.trim()

    if (!name) {
      setError('Enter the new vehicle category name.')
      return
    }

    setSavingCategory(true)

    try {
      const createdCategory = await createVehicleCategory({ name })

      setCategories((current) => {
        const exists = current.some(
          (category) => category.id === createdCategory.id
        )

        return exists
          ? current
          : [...current, createdCategory].sort(
              (a, b) => a.name.localeCompare(b.name)
            )
      })

      setNewVehicle((current) => ({
        ...current,
        category: String(createdCategory.id),
      }))

      setNewCategoryName('')
      setShowCategoryForm(false)

      setSuccess(
        `Category "${createdCategory.name}" created and selected successfully.`
      )
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSavingCategory(false)
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

    if (
      ['SUPERVISOR', 'DETAILER'].includes(role) &&
      !ownBranchId
    ) {
      setError('Your staff profile does not have an assigned branch.')
      return
    }

    const plasticCount = Number(plasticMatCount)
    const woolenCount = Number(woolenMatCount)

    if (
      !Number.isInteger(plasticCount) ||
      plasticCount < 0 ||
      !Number.isInteger(woolenCount) ||
      woolenCount < 0
    ) {
      setError('Mat counts must be whole numbers of zero or greater.')
      return
    }

    setSavingVisit(true)

    try {
      const payload = {
        vehicle: Number(selectedVehicle.id),
        plastic_mat_count: plasticCount,
        woolen_mat_count: woolenCount,
        comment: comment.trim(),
      }

      if (canChooseBranch(role)) {
        payload.branch = Number(servicingBranchId)
      }

      const createdVisit = await createVisit(payload)

      setSuccess(
        `Visit #${createdVisit.id} created successfully for ${selectedVehicle.registration_number}.`
      )

      setComment('')
      setPlasticMatCount('0')
      setWoolenMatCount('0')
      setSelectedVehicle(null)
      setJustRegisteredVehicle(null)
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
        <h2 className="font-semibold text-amber-900">Access restricted</h2>
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
          Vehicle registration *
        </label>

        <div className="relative">
          <Search
            size={19}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            required
            autoComplete="off"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Start typing, e.g. KDA123A"
            className="w-full rounded-lg border border-slate-300 py-3 pl-10 pr-12 uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
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

        {!selectedVehicle && normalizedSearch.length >= 2 && searching && (
          <p className="mt-3 text-sm text-slate-500">
            Searching registered vehicles...
          </p>
        )}

        {!selectedVehicle && !searching && vehicles.length > 0 && (
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
                    {vehicle.make_model || 'Make/model not recorded'}
                    {vehicle.category_name ? ` · ${vehicle.category_name}` : ''}
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
                  {selectedVehicle.make_model || 'Make/model not recorded'}
                  {selectedVehicle.category_name
                    ? ` · ${selectedVehicle.category_name}`
                    : ''}
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
                  setJustRegisteredVehicle(null)
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
                  Register this vehicle below. Its registration is automatically converted to uppercase without spaces.
                </p>
              </div>
            </div>

            <form onSubmit={handleRegisterVehicle} className="space-y-4">
              {['SUPERVISOR', 'DETAILER'].includes(role) && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                  <p className="font-medium text-slate-700">
                    Vehicle registration branch
                  </p>
                  <p className="mt-1 font-semibold text-blue-900">
                    {ownBranchName || 'Branch not assigned'}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    This is taken from your staff profile and submitted automatically.
                  </p>
                </div>
              )}

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
                        event.target.value
                      )
                    }
                    placeholder="KDA123A"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 uppercase outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Spaces are removed automatically.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Make / model *
                  </label>
                  <input
                    required
                    list="vehicle-make-model-suggestions"
                    autoComplete="off"
                    value={newVehicle.make_model}
                    onChange={(event) =>
                      updateNewVehicle('make_model', event.target.value)
                    }
                    placeholder="e.g. Toyota Fielder"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                  />
                  <datalist id="vehicle-make-model-suggestions">
                    {makeModelSuggestions.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                  {searchingModels && (
                    <p className="mt-1 text-xs text-slate-500">
                      Finding make/model suggestions...
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    Select a suggestion or type a new make/model.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Vehicle category *
                  </label>
                  <select
                    required
                    value={newVehicle.category}
                    onChange={(event) =>
                      updateNewVehicle('category', event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                  >
                    <option value="">Select category</option>
                    {categories
                      .filter((category) => category.is_active)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>

                  {canCreateCategory(role) && (
                    <button
                      type="button"
                      onClick={() =>
                        setShowCategoryForm((current) => !current)
                      }
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
                    >
                      {showCategoryForm ? (
                        <>
                          <X size={15} />
                          Cancel adding category
                        </>
                      ) : (
                        <>
                          <Plus size={15} />
                          Add new category
                        </>
                      )}
                    </button>
                  )}

                  {showCategoryForm && canCreateCategory(role) && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        New category name
                      </label>
                      <input
                        value={newCategoryName}
                        onChange={(event) =>
                          setNewCategoryName(event.target.value)
                        }
                        placeholder="e.g. Minibus"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        disabled={savingCategory || !newCategoryName.trim()}
                        className="mt-2 inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingCategory && (
                          <Loader2 size={15} className="mr-2 animate-spin" />
                        )}
                        {savingCategory ? 'Saving...' : 'Save category'}
                      </button>
                    </div>
                  )}
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
                          {customer.full_name} - {customer.phone_number}
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
                      updateNewVehicle('no_plastic_mat', event.target.checked)
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
                      updateNewVehicle('no_woolen_mat', event.target.checked)
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
                    updateNewVehicle('special_concerns', event.target.value)
                  }
                  placeholder="Optional vehicle notes or customer instructions"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={
                  savingVehicle ||
                  savingCategory ||
                  (['SUPERVISOR', 'DETAILER'].includes(role) && !ownBranchId)
                }
                className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingVehicle && (
                  <Loader2 size={17} className="mr-2 animate-spin" />
                )}
                {savingVehicle
                  ? 'Registering vehicle...'
                  : 'Register and continue to visit'}
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

      <section
        ref={visitSectionRef}
        className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              2. Create vehicle visit
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Record the branch and vehicle details for this visit.
            </p>
          </div>

          {justRegisteredVehicle && (
            <button
              type="button"
              onClick={scrollToVisitSection}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <ArrowDown size={16} />
              Continue to visit
            </button>
          )}
        </div>

        {justRegisteredVehicle && (
          <div className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-green-100 p-2 text-green-700">
                <CheckCircle2 size={21} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-green-900">
                  Vehicle registered successfully
                </p>
                <p className="mt-1 text-sm text-green-800">
                  <strong>{justRegisteredVehicle.registration_number}</strong>
                  {' — '}
                  {justRegisteredVehicle.make_model || 'Vehicle'}
                </p>
                <p className="mt-1 text-sm text-green-700">
                  The vehicle is selected. Complete the visit details below.
                </p>
              </div>
            </div>
          </div>
        )}

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
              <strong>{ownBranchName || 'Branch not assigned'}</strong>
              <span className="ml-1 text-xs text-slate-500">
                (from your staff profile)
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Number of plastic mats
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={plasticMatCount}
                onChange={(event) => setPlasticMatCount(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Number of woolen mats
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={woolenMatCount}
                onChange={(event) => setWoolenMatCount(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Comment
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Optional comments about this visit"
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
            disabled={
              savingVisit ||
              !selectedVehicle ||
              (['SUPERVISOR', 'DETAILER'].includes(role) && !ownBranchId)
            }
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

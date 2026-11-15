
import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CarFront,
  Check,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
  Trash2,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  getVehicles,
  registerVehicle,
  getCustomers,
  getVehicleCategories,
  createVehicleCategory,
} from '../api/vehicles'

import {
  createVehicleIntakeWorkflow,
} from '../api/visits'

import { getServices } from '../api/services'
import { getBranches } from '../api/branches'

import {
  getMyStaffProfile,
  getBranchStaff,
} from '../api/staffOperations'

// --------------------------------------------------
// PERMISSIONS
// --------------------------------------------------

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

const canAddServices = (role) =>
  ['ADMIN', 'SUPERVISOR', 'DETAILER'].includes(role)

const canAssignEmployees = (role) =>
  ['ADMIN', 'SUPERVISOR'].includes(role)

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

const normalizeRegistration = (value) =>
  String(value ?? '').replace(/\s+/g, '').toUpperCase()

const normalizeVehicleInstruction = (checked) =>
  checked ? 'Yes' : ''

const getBranchId = (profile) => {
  if (!profile?.branch) return ''

  if (typeof profile.branch === 'object') {
    return profile.branch.id || ''
  }

  return profile.branch
}

const getErrorMessage = (error) => {
  const data = error?.response?.data

  if (typeof data === 'string') return data
  if (data?.detail) return data.detail

  if (data && typeof data === 'object') {
    return Object.entries(data)
      .map(([field, messages]) => {
        const message = Array.isArray(messages)
          ? messages.join(' ')
          : typeof messages === 'object'
            ? JSON.stringify(messages)
            : String(messages)

        return `${field}: ${message}`
      })
      .join(' ')
  }

  return error?.message || 'Something went wrong. Please try again.'
}

const formatKES = (value) => {
  const amount = Number(value)

  if (!Number.isFinite(amount)) return 'KES 0.00'

  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

const getCategoryLabel = (category) => {
  if (category === 'CAR_WASH') return 'Car wash'
  if (category === 'DETAILING') return 'Detailing'

  return category || 'Other'
}

const getEligibleRole = (category) => {
  if (category === 'CAR_WASH') return 'CLEANER'
  if (category === 'DETAILING') return 'DETAILER'

  return null
}

const getStaffName = (staff) =>
  staff.full_name ||
  staff.username ||
  staff.staff_number ||
  `Staff member #${staff.id}`

const emptyVehicle = {
  registration_number: '',
  make_model: '',
  category: '',
  no_plastic_mat: false,
  no_woolen_mat: false,
  special_concerns: '',
}

// --------------------------------------------------
// PAGE
// --------------------------------------------------

export default function CheckInPage() {
  const { user } = useAuth()
  const role = user?.role

  // ------------------------------------------------
  // DATA
  // ------------------------------------------------

  const [vehicles, setVehicles] = useState([])
  const [customers, setCustomers] = useState([])
  const [branches, setBranches] = useState([])
  const [categories, setCategories] = useState([])
  const [services, setServices] = useState([])
  const [branchStaff, setBranchStaff] = useState([])
  const [staffProfile, setStaffProfile] = useState(null)

  // ------------------------------------------------
  // FORM STATE
  // ------------------------------------------------

  const [search, setSearch] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [newVehicle, setNewVehicle] = useState(emptyVehicle)

  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [registrationBranchId, setRegistrationBranchId] = useState('')
  const [servicingBranchId, setServicingBranchId] = useState('')

  const [plasticMatCount, setPlasticMatCount] = useState('0')
  const [woolenMatCount, setWoolenMatCount] = useState('0')
  const [comment, setComment] = useState('')

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedServices, setSelectedServices] = useState([])

  const [makeModelSuggestions, setMakeModelSuggestions] = useState([])

  // ------------------------------------------------
  // UI STATE
  // ------------------------------------------------

  const [loading, setLoading] = useState(true)
  const [loadingServices, setLoadingServices] = useState(false)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchingModels, setSearchingModels] = useState(false)

  const [savingCategory, setSavingCategory] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  // ------------------------------------------------
  // DERIVED VALUES
  // ------------------------------------------------

  const normalizedSearch = normalizeRegistration(search)
  const ownBranchId = getBranchId(staffProfile)
  const ownBranchName = staffProfile?.branch_name || ''

  const effectiveBranchId = canChooseBranch(role)
    ? servicingBranchId
    : ownBranchId

  const showRegistrationForm =
    canCreateVehicle(role) &&
    !selectedVehicle &&
    normalizedSearch.length >= 2 &&
    !searching &&
    vehicles.length === 0

  const availableServices = useMemo(() => {
    return services.filter(
      (service) =>
        service.is_active &&
        !selectedServices.some(
          (item) => Number(item.service.id) === Number(service.id)
        )
    )
  }, [services, selectedServices])

  const selectedServiceTotal = useMemo(() => {
    return selectedServices.reduce(
      (total, item) => total + Number(item.service.price || 0),
      0
    )
  }, [selectedServices])

  // ------------------------------------------------
  // LOAD INITIAL DATA
  // ------------------------------------------------

  useEffect(() => {
    let active = true

    const loadInitialData = async () => {
      setLoading(true)
      setError('')

      try {
        const requests = [
          getVehicleCategories(),
          getServices(),
        ]

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

        setCategories(results[index++] || [])

        setServices(
          (results[index++] || []).filter(
            (service) => service.is_active
          )
        )

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
              'Your staff profile has no assigned branch. Ask an administrator to assign your branch before using Check-in.'
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

  // ------------------------------------------------
  // LOAD ELIGIBLE STAFF FOR THE SELECTED BRANCH
  // ------------------------------------------------

  useEffect(() => {
    let active = true

    if (!canAssignEmployees(role) || !effectiveBranchId) {
      setBranchStaff([])
      setLoadingStaff(false)

      return () => {
        active = false
      }
    }

    const loadStaff = async () => {
      setLoadingStaff(true)

      try {
        const results = await getBranchStaff({
          branch_id: effectiveBranchId,
        })

        if (active) {
          setBranchStaff(
            results.filter(
              (staff) =>
                staff.employment_status === 'ACTIVE' &&
                !staff.is_archived
            )
          )
        }
      } catch (loadError) {
        if (active) {
          setBranchStaff([])
          setError(
            `Unable to load employees for assignment: ${getErrorMessage(loadError)}`
          )
        }
      } finally {
        if (active) setLoadingStaff(false)
      }
    }

    loadStaff()

    return () => {
      active = false
    }
  }, [role, effectiveBranchId])

  // ------------------------------------------------
  // VEHICLE SEARCH
  // ------------------------------------------------

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

  // ------------------------------------------------
  // MAKE / MODEL SUGGESTIONS
  // ------------------------------------------------

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
        const results = await getVehicles({
          search: makeModel,
        })

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

  // ------------------------------------------------
  // VEHICLE HANDLERS
  // ------------------------------------------------

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
    setVehicles([])
    setError('')
    setSuccess('')
    setSelectedServices([])

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
    setSearch(
      normalizeRegistration(vehicle.registration_number)
    )
    setError('')
    setSuccess('')
    setSelectedServices([])
  }

  const handleChangeVehicle = () => {
    setSelectedVehicle(null)
    setSearch('')
    setVehicles([])
    setSelectedServices([])
    setSelectedCustomerId('')
    setNewVehicle(emptyVehicle)
    setError('')
    setSuccess('')
  }

  // ------------------------------------------------
  // CATEGORY HANDLER
  // ------------------------------------------------

  const handleCreateCategory = async () => {
    setError('')
    setSuccess('')

    if (!canCreateCategory(role)) {
      setError(
        'Only ADMIN and SUPERVISOR can create vehicle categories.'
      )
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
        `Category "${createdCategory.name}" created and selected.`
      )
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSavingCategory(false)
    }
  }

  // ------------------------------------------------
  // ADD / REMOVE SERVICES IN THE LOCAL FORM
  // ------------------------------------------------

  const handleAddService = () => {
    setError('')
    setSuccess('')

    if (!selectedServiceId) {
      setError('Choose a service first.')
      return
    }

    const service = services.find(
      (item) => Number(item.id) === Number(selectedServiceId)
    )

    if (!service || !service.is_active) {
      setError('The selected service is unavailable.')
      return
    }

    if (
      selectedServices.some(
        (item) => Number(item.service.id) === Number(service.id)
      )
    ) {
      setError('This service has already been added.')
      return
    }

    setSelectedServices((current) => [
      ...current,
      {
        service,
        staffIds: [],
      },
    ])

    setSelectedServiceId('')
  }

  const handleRemoveService = (serviceId) => {
    setSelectedServices((current) =>
      current.filter(
        (item) => Number(item.service.id) !== Number(serviceId)
      )
    )
  }

  // ------------------------------------------------
  // SELECT EMPLOYEES FOR EACH SERVICE
  // ------------------------------------------------

  const handleToggleStaff = (serviceId, staffId) => {
    setSelectedServices((current) =>
      current.map((item) => {
        if (Number(item.service.id) !== Number(serviceId)) {
          return item
        }

        const currentlySelected = item.staffIds.includes(
          Number(staffId)
        )

        return {
          ...item,
          staffIds: currentlySelected
            ? item.staffIds.filter(
                (id) => id !== Number(staffId)
              )
            : [...item.staffIds, Number(staffId)],
        }
      })
    )
  }

  // ------------------------------------------------
  // VALIDATE AND SUBMIT THE WHOLE WORKFLOW
  // ------------------------------------------------

  const handleSubmit = async (event) => {
    event.preventDefault()

    setError('')
    setSuccess('')

    if (!canCreateVisit(role)) {
      setError('Your account cannot create vehicle visits.')
      return
    }

    const usingExistingVehicle = Boolean(selectedVehicle)

    if (!usingExistingVehicle && !canCreateVehicle(role)) {
      setError(
        'Your account cannot register new vehicles. Select an existing vehicle.'
      )
      return
    }

    if (
      canChooseBranch(role) &&
      !servicingBranchId
    ) {
      setError('Select the servicing branch.')
      return
    }

    if (
      ['SUPERVISOR', 'DETAILER'].includes(role) &&
      !ownBranchId
    ) {
      setError('Your staff profile has no assigned branch.')
      return
    }

    if (
      !usingExistingVehicle &&
      canChooseBranch(role) &&
      !registrationBranchId
    ) {
      setError('Select the vehicle registration branch.')
      return
    }

    if (!usingExistingVehicle) {
      if (!newVehicle.registration_number.trim()) {
        setError('Enter the vehicle registration number.')
        return
      }

      if (!newVehicle.make_model.trim()) {
        setError('Enter the vehicle make and model.')
        return
      }

      if (!newVehicle.category) {
        setError('Select the vehicle category.')
        return
      }
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

    if (
      canAddServices(role) &&
      selectedServices.length === 0
    ) {
      setError('Add at least one service to this vehicle visit.')
      return
    }

    if (canAssignEmployees(role)) {
      const unassignedServices = selectedServices.filter(
        (item) => item.staffIds.length === 0
      )

      if (unassignedServices.length > 0) {
        setError(
          `Assign at least one eligible employee to each service. Awaiting assignment: ${unassignedServices.map((item) => item.service.name).join(', ')}.`
        )
        return
      }

      if (loadingStaff) {
        setError('Wait for the eligible employee list to finish loading.')
        return
      }

      for (const item of selectedServices) {
        const expectedRole = getEligibleRole(
          item.service.category
        )

        const eligibleIds = branchStaff
          .filter((staff) => staff.role === expectedRole)
          .map((staff) => Number(staff.id))

        const invalidStaff = item.staffIds.some(
          (id) => !eligibleIds.includes(Number(id))
        )

        if (invalidStaff) {
          setError(
            `One or more selected employees are not eligible for ${item.service.name}.`
          )
          return
        }
      }
    }

    const payload = {
      plastic_mat_count: plasticCount,
      woolen_mat_count: woolenCount,
      comment: comment.trim(),
      services: selectedServices.map((item) => ({
        service_id: Number(item.service.id),
        staff_ids: item.staffIds.map(Number),
      })),
    }

    if (usingExistingVehicle) {
      payload.vehicle_id = Number(selectedVehicle.id)
    } else {
      payload.vehicle = {
        registration_number: normalizeRegistration(
          newVehicle.registration_number
        ),
        make_model: newVehicle.make_model.trim(),
        category: Number(newVehicle.category),
        customer: selectedCustomerId
          ? Number(selectedCustomerId)
          : null,
        no_plastic_mat: normalizeVehicleInstruction(
          newVehicle.no_plastic_mat
        ),
        no_woolen_mat: normalizeVehicleInstruction(
          newVehicle.no_woolen_mat
        ),
        special_concerns: newVehicle.special_concerns.trim(),
      }

      payload.registration_branch_id = Number(
        canChooseBranch(role)
          ? registrationBranchId
          : ownBranchId
      )
    }

    payload.branch_id = Number(
      canChooseBranch(role)
        ? servicingBranchId
        : ownBranchId
    )

    setSubmitting(true)

    try {
      const result = await createVehicleIntakeWorkflow(payload)

      const vehicleRegistration =
        result.visit?.vehicle_registration ||
        selectedVehicle?.registration_number ||
        newVehicle.registration_number

      const visitNumber = result.visit?.id
      const serviceCount = result.services?.length || 0

      const assignmentCount = (result.services || []).reduce(
        (total, item) =>
          total + (item.assignments?.length || 0),
        0
      )

      const vehicleAction = result.vehicle_created
        ? 'Vehicle registered'
        : 'Existing vehicle selected'

      setSuccess(
        `${vehicleAction} successfully. Visit #${visitNumber} created for ${vehicleRegistration}. ${serviceCount} service(s) and ${assignmentCount} employee assignment(s) saved successfully.`
      )

      // Reset transaction-specific form fields.
      setSelectedVehicle(null)
      setVehicles([])
      setSearch('')
      setNewVehicle(emptyVehicle)

      setSelectedCustomerId('')
      setPlasticMatCount('0')
      setWoolenMatCount('0')
      setComment('')

      setSelectedServices([])
      setSelectedServiceId('')

      setShowCategoryForm(false)
      setNewCategoryName('')
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  // ------------------------------------------------
  // ACCESS / LOADING STATES
  // ------------------------------------------------

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
        <Loader2 size={22} className="mr-3 animate-spin" />
        Loading check-in information...
      </div>
    )
  }

  // ------------------------------------------------
  // RENDER
  // ------------------------------------------------

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
              Register or select a vehicle, add services and assign employees
              in one submission.
            </p>
          </div>
        </div>
      </section>

      {/* FEEDBACK */}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <p>{error}</p>

          <button
            type="button"
            onClick={() => setError('')}
            className="ml-auto text-red-700 hover:text-red-900"
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
          <p>{success}</p>

          <button
            type="button"
            onClick={() => setSuccess('')}
            className="ml-auto text-green-700 hover:text-green-900"
            aria-label="Dismiss success message"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ------------------------------------------
            1. VEHICLE
        ------------------------------------------ */}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Step 1
            </p>

            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Vehicle details
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Search for an existing vehicle or register a new one.
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
              autoComplete="off"
              value={search}
              onChange={(event) =>
                handleSearchChange(event.target.value)
              }
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

          {!selectedVehicle &&
            normalizedSearch.length >= 2 &&
            searching && (
              <p className="mt-3 text-sm text-slate-500">
                Searching registered vehicles...
              </p>
            )}

          {/* EXISTING VEHICLE RESULTS */}

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
                      {vehicle.category_name
                        ? ` · ${vehicle.category_name}`
                        : ''}
                      {vehicle.branch_name
                        ? ` · ${vehicle.branch_name}`
                        : ''}
                    </span>
                  </span>

                  <span className="text-xs font-semibold text-blue-700">
                    {vehicle.is_active ? 'Select vehicle' : 'Inactive'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* SELECTED EXISTING VEHICLE */}

          {selectedVehicle && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                    Existing vehicle selected
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
                </div>

                <button
                  type="button"
                  onClick={handleChangeVehicle}
                  className="text-sm font-semibold text-blue-700 hover:text-blue-900"
                >
                  Change
                </button>
              </div>
            </div>
          )}

          {/* NEW VEHICLE REGISTRATION FIELDS */}

          {showRegistrationForm && (
            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                  <UserPlus size={20} />
                </div>

                <div>
                  <h3 className="font-semibold text-slate-900">
                    Register new vehicle
                  </h3>

                  <p className="mt-1 text-sm text-slate-600">
                    The vehicle will only be saved when you submit the complete
                    check-in form.
                  </p>
                </div>
              </div>

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
                      updateNewVehicle(
                        'make_model',
                        event.target.value
                      )
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
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Vehicle category *
                  </label>

                  <select
                    required
                    value={newVehicle.category}
                    onChange={(event) =>
                      updateNewVehicle(
                        'category',
                        event.target.value
                      )
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-blue-500"
                  >
                    <option value="">Select category</option>

                    {categories
                      .filter((category) => category.is_active)
                      .map((category) => (
                        <option
                          key={category.id}
                          value={category.id}
                        >
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
                      <Plus size={15} />
                      Add vehicle category
                    </button>
                  )}

                  {showCategoryForm && canCreateCategory(role) && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
                      <input
                        value={newCategoryName}
                        onChange={(event) =>
                          setNewCategoryName(event.target.value)
                        }
                        placeholder="New category name"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                      />

                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        disabled={
                          savingCategory || !newCategoryName.trim()
                        }
                        className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingCategory
                          ? 'Saving...'
                          : 'Save category'}
                      </button>
                    </div>
                  )}
                </div>

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
                        <option
                          key={customer.id}
                          value={customer.id}
                        >
                          {customer.full_name} - {customer.phone_number}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

                {['SUPERVISOR', 'DETAILER'].includes(role) && (
                  <div className="rounded-lg bg-white p-3 text-sm text-slate-600">
                    Registration branch:{' '}
                    <strong>{ownBranchName || 'Not assigned'}</strong>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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

              <div className="mt-4">
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
            </div>
          )}

          {!selectedVehicle &&
            !searching &&
            normalizedSearch.length >= 2 &&
            vehicles.length > 0 &&
            vehicles.every((vehicle) => !vehicle.is_active) && (
              <p className="mt-3 text-sm text-amber-700">
                Matching records exist, but they are inactive. Ask an
                administrator to reactivate the correct vehicle instead of
                registering a duplicate.
              </p>
            )}
        </section>

        {/* ------------------------------------------
            2. VISIT DETAILS
        ------------------------------------------ */}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
              Step 2
            </p>

            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Visit details
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              These details will be saved together with the vehicle and service
              assignments.
            </p>
          </div>

          {canChooseBranch(role) ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              {selectedVehicle && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <span className="block text-xs text-slate-500">
                    Vehicle registration branch
                  </span>

                  <strong>
                    {selectedVehicle.branch_name || 'Not recorded'}
                  </strong>

                  <p className="mt-1 text-xs text-slate-500">
                    The servicing branch can be different from the original
                    registration branch.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Servicing branch:{' '}
              <strong>{ownBranchName || 'Branch not assigned'}</strong>
              <span className="ml-1 text-xs text-slate-500">
                (from your staff profile)
              </span>
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Number of plastic mats
              </label>

              <input
                type="number"
                min="0"
                step="1"
                value={plasticMatCount}
                onChange={(event) =>
                  setPlasticMatCount(event.target.value)
                }
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
                value={woolenMatCount}
                onChange={(event) =>
                  setWoolenMatCount(event.target.value)
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Visit comment
            </label>

            <textarea
              rows={3}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Optional comments about this visit"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </div>
        </section>

        {/* ------------------------------------------
            3. SERVICES AND ASSIGNMENTS
        ------------------------------------------ */}

        {canAddServices(role) && (
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Step 3
              </p>

              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Services and employee assignments
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Add all services required for this vehicle and select the
                employees who will perform each service.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Add a service
              </label>

              {loadingServices ? (
                <div className="flex items-center gap-2 py-3 text-sm text-slate-500">
                  <Loader2 size={17} className="animate-spin" />
                  Loading services...
                </div>
              ) : services.length === 0 ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No active services are available in the catalogue.
                </p>
              ) : availableServices.length === 0 ? (
                <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  All active services have been added.
                </p>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select
                    value={selectedServiceId}
                    onChange={(event) =>
                      setSelectedServiceId(event.target.value)
                    }
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-blue-500"
                  >
                    <option value="">Choose a service</option>

                    {availableServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} — {getCategoryLabel(service.category)} —{' '}
                        {formatKES(service.price)}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddService}
                    disabled={!selectedServiceId}
                    className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={17} className="mr-2" />
                    Add service
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  Selected services
                </h3>

                <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                  {selectedServices.length}{' '}
                  {selectedServices.length === 1 ? 'service' : 'services'}
                </span>
              </div>

              {selectedServices.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                  <ClipboardList
                    size={30}
                    className="mx-auto text-slate-400"
                  />

                  <p className="mt-3 font-medium text-slate-700">
                    No services selected
                  </p>

                  <p className="mt-1 text-sm text-slate-500">
                    Choose a service above to add it to this visit.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedServices.map((item) => {
                    const service = item.service
                    const expectedRole = getEligibleRole(
                      service.category
                    )

                    const eligibleStaff = branchStaff.filter(
                      (staff) => staff.role === expectedRole
                    )

                    return (
                      <article
                        key={service.id}
                        className="overflow-hidden rounded-xl border border-slate-200"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                              <Check size={18} />
                            </div>

                            <div>
                              <p className="font-semibold text-slate-900">
                                {service.name}
                              </p>

                              <p className="mt-1 text-xs text-slate-500">
                                {getCategoryLabel(service.category)}
                                {service.code ? ` · ${service.code}` : ''}
                                {service.duration_minutes
                                  ? ` · ${service.duration_minutes} minutes`
                                  : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <p className="font-semibold text-slate-900">
                              {formatKES(service.price)}
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveService(service.id)
                              }
                              title="Remove service from this form"
                              className="rounded-lg border border-red-200 p-2 text-red-700 hover:bg-red-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        {canAssignEmployees(role) && (
                          <div className="p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <h4 className="text-sm font-semibold text-slate-800">
                                  Assign employees
                                </h4>

                                <p className="mt-1 text-xs text-slate-500">
                                  {expectedRole === 'CLEANER'
                                    ? 'Choose one or more active cleaners.'
                                    : 'Choose one or more active detailers.'}
                                </p>
                              </div>

                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                <Users size={13} />
                                {item.staffIds.length} selected
                              </span>
                            </div>

                            {!effectiveBranchId ? (
                              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                                Select the servicing branch to load its
                                employees.
                              </p>
                            ) : loadingStaff ? (
                              <div className="flex items-center gap-2 text-sm text-slate-500">
                                <Loader2
                                  size={16}
                                  className="animate-spin"
                                />
                                Loading eligible employees...
                              </div>
                            ) : eligibleStaff.length === 0 ? (
                              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                No active{' '}
                                {expectedRole === 'CLEANER'
                                  ? 'cleaners'
                                  : 'detailers'}{' '}
                                found for this branch. Check staff roles and
                                employment status.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {eligibleStaff.map((staff) => {
                                  const checked = item.staffIds.includes(
                                    Number(staff.id)
                                  )

                                  return (
                                    <label
                                      key={staff.id}
                                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                                        checked
                                          ? 'border-blue-300 bg-blue-50'
                                          : 'border-slate-200 bg-white hover:bg-slate-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() =>
                                          handleToggleStaff(
                                            service.id,
                                            staff.id
                                          )
                                        }
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                                      />

                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-medium text-slate-800">
                                          {getStaffName(staff)}
                                        </span>

                                        <span className="mt-0.5 block text-xs text-slate-500">
                                          {staff.staff_number || 'No staff number'}
                                          {staff.current_shift
                                            ? ` · ${staff.current_shift} shift`
                                            : ''}
                                        </span>
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {!canAssignEmployees(role) && (
                          <div className="p-4">
                            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                              Employee assignment is performed by an ADMIN or
                              SUPERVISOR. This service will be saved without
                              employee assignments.
                            </p>
                          </div>
                        )}

                        {expectedRole && canAssignEmployees(role) && (
                          <div className="border-t border-slate-100 px-4 py-3">
                            <p className="text-xs text-slate-500">
                              Required employee role:{' '}
                              <strong>{expectedRole}</strong>
                            </p>
                          </div>
                        )}
                      </article>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedServices.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
                <div>
                  <p className="text-xs text-slate-500">
                    Catalogue price total
                  </p>

                  <p className="text-xl font-bold text-slate-900">
                    {formatKES(selectedServiceTotal)}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Indicative service total; final billing and discounts are
                    handled separately.
                  </p>
                </div>

                <p className="text-sm text-slate-600">
                  {selectedServices.reduce(
                    (total, item) => total + item.staffIds.length,
                    0
                  )}{' '}
                  employee assignment(s) selected
                </p>
              </div>
            )}
          </section>
        )}

        {/* OWNER ROLE INFORMATION */}

        {role === 'OWNER' && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              OWNER access can record a visit for an existing vehicle. Vehicle
              registration and service/employee assignment are handled by
              authorized operational staff.
            </p>
          </section>
        )}

        {/* ------------------------------------------
            FINAL SUBMISSION
        ------------------------------------------ */}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Review and submit
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Vehicle, visit, services and employee assignments are saved
              together when you submit.
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Vehicle</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedVehicle
                  ? 'Existing'
                  : showRegistrationForm
                    ? 'New'
                    : 'Not selected'}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Services</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedServices.length}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Employees</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {selectedServices.reduce(
                  (total, item) => total + item.staffIds.length,
                  0
                )}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Servicing branch</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                {canChooseBranch(role)
                  ? branches.find(
                      (branch) =>
                        String(branch.id) === String(servicingBranchId)
                    )?.name || 'Not selected'
                  : ownBranchName || 'Not assigned'}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              submitting ||
              (canAssignEmployees(role) && loadingStaff)
            }
            className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="mr-2 animate-spin" />
                Saving vehicle, visit and assignments...
              </>
            ) : (
              <>
                <CheckCircle2 size={18} className="mr-2" />
                {selectedVehicle
                  ? 'Submit vehicle visit and assignments'
                  : 'Register vehicle and submit visit'}
              </>
            )}
          </button>

          <p className="mt-3 text-center text-xs text-slate-500">
            One submission saves the complete workflow. If validation fails,
            the database transaction is rolled back.
          </p>
        </section>
      </form>
    </div>
  )
}

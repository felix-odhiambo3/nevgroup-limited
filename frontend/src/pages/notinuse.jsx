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
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

import {
  getVehicles,
  getCustomers,
  getVehicleCategories,
  createVehicleCategory,
} from '../api/vehicles'

import { createVehicleIntakeWorkflow } from '../api/visits'
import {
  getServices,
  getBranchServicePrices,
  getBranchServiceCategoryPrices,
} from '../api/services'
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

const emptyVehicle = {
  registration_number: '',
  make_model: '',
  category: '',
  no_plastic_mat: false,
  no_woolen_mat: false,
  special_concerns: '',
}

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

  if (!Number.isFinite(amount)) return 'Price unavailable'

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

const getVehicleCategoryId = (vehicle) => {
  if (!vehicle) return ''

  if (vehicle.category_id) return vehicle.category_id

  if (vehicle.category && typeof vehicle.category === 'object') {
    return vehicle.category.id || ''
  }

  if (
    vehicle.category &&
    (typeof vehicle.category === 'number' ||
      /^\d+$/.test(String(vehicle.category)))
  ) {
    return vehicle.category
  }

  return ''
}

// --------------------------------------------------
// SMALL REUSABLE UI COMPONENTS
// --------------------------------------------------

function Field({ label, required = false, children, hint }) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>

      {children}

      {hint && (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

const inputClass =
  'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

function SectionHeading({ icon: Icon, title, description, trailing }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
            <Icon size={19} />
          </div>
        )}

        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>

          {description && (
            <p className="mt-0.5 text-sm text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>

      {trailing}
    </div>
  )
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
  const [branchPrices, setBranchPrices] = useState([])
  const [categoryPrices, setCategoryPrices] = useState([])
  const [branchStaff, setBranchStaff] = useState([])
  const [staffProfile, setStaffProfile] = useState(null)

  // ------------------------------------------------
  // VEHICLE STATE
  // ------------------------------------------------

  const [search, setSearch] = useState('')
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [newVehicle, setNewVehicle] = useState(emptyVehicle)
  const [selectedCustomerId, setSelectedCustomerId] = useState('')

  // ------------------------------------------------
  // BRANCH STATE
  // ------------------------------------------------

  const [registrationBranchId, setRegistrationBranchId] = useState('')
  const [servicingBranchId, setServicingBranchId] = useState('')

  // ------------------------------------------------
  // VISIT STATE
  // ------------------------------------------------

  const [plasticMatCount, setPlasticMatCount] = useState('0')
  const [woolenMatCount, setWoolenMatCount] = useState('0')
  const [comment, setComment] = useState('')

  // ------------------------------------------------
  // SERVICE STATE
  // ------------------------------------------------

  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [selectedServices, setSelectedServices] = useState([])

  // ------------------------------------------------
  // UI STATE
  // ------------------------------------------------

  const [loading, setLoading] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [loadingPrices, setLoadingPrices] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchingModels, setSearchingModels] = useState(false)

  const [savingCategory, setSavingCategory] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [makeModelSuggestions, setMakeModelSuggestions] = useState([])
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [checkInCompleted, setCheckInCompleted] = useState(false)
  const [showOptionalVehicleFields, setShowOptionalVehicleFields] = useState(false)
  const [showReviewAndSubmit, setShowReviewAndSubmit] = useState(false)
  const [showVisitDetails, setShowVisitDetails] = useState(false)

  // ------------------------------------------------
  // DERIVED VALUES
  // ------------------------------------------------

  const normalizedSearch = normalizeRegistration(search)
  const ownBranchId = getBranchId(staffProfile)
  const ownBranchName = staffProfile?.branch_name || ''

  const effectiveBranchId = canChooseBranch(role)
    ? servicingBranchId
    : ownBranchId

  const selectedVehicleCategoryId = selectedVehicle
    ? getVehicleCategoryId(selectedVehicle)
    : newVehicle.category

  const showRegistrationForm =
    canCreateVehicle(role) &&
    !selectedVehicle &&
    normalizedSearch.length >= 2 &&
    !searching &&
    vehicles.length === 0

  const getBranchPrice = (serviceId) =>
    branchPrices.find(
      (item) =>
        Number(item.service) === Number(serviceId) &&
        item.is_active
    )

  const getServicePriceInfo = (service) => {
    const branchPrice = getBranchPrice(service.id)

    if (!branchPrice) {
      return {
        available: false,
        amount: null,
        reason: '',
        message: 'No active price configured for this branch.',
      }
    }

    if (service.pricing_mode === 'FIXED') {
      if (branchPrice.price === null || branchPrice.price === undefined) {
        return {
          available: false,
          amount: null,
          reason: '',
          message: 'The fixed branch price is not configured.',
        }
      }

      return {
        available: true,
        amount: Number(branchPrice.price),
        reason: branchPrice.zero_price_reason || '',
        message: '',
      }
    }

    if (service.pricing_mode === 'VEHICLE_CATEGORY') {
      if (!selectedVehicleCategoryId) {
        return {
          available: false,
          amount: null,
          reason: '',
          message: 'Select a vehicle category to determine this price.',
        }
      }

      const categoryPrice = categoryPrices.find(
        (item) =>
          Number(item.branch_service_price) === Number(branchPrice.id) &&
          Number(item.vehicle_category) ===
            Number(selectedVehicleCategoryId) &&
          item.is_active
      )

      if (!categoryPrice) {
        return {
          available: false,
          amount: null,
          reason: '',
          message: 'No active price is configured for this vehicle category.',
        }
      }

      return {
        available: true,
        amount: Number(categoryPrice.price),
        reason: categoryPrice.zero_price_reason || '',
        message: '',
      }
    }

    if (service.pricing_mode === 'SUPERVISOR_SET') {
      if (role !== 'SUPERVISOR') {
        return {
          available: false,
          amount: null,
          reason: '',
          message: 'This service is not available for your role.',
        }
      }

      return {
        available: true,
        amount: null,
        reason: '',
        message: 'The supervisor must enter the agreed price.',
      }
    }

    return {
      available: false,
      amount: null,
      reason: '',
      message: 'Unsupported pricing method.',
    }
  }

  const availableServices = useMemo(
    () =>
      services.filter((service) => {
        if (!service.is_active) return false

        if (
          service.pricing_mode === 'SUPERVISOR_SET' &&
          role !== 'SUPERVISOR'
        ) {
          return false
        }

        return !selectedServices.some(
          (item) =>
            Number(item.service.id) === Number(service.id)
        )
      }),
    [services, selectedServices, role]
  )

  const selectedServiceTotal = useMemo(() => {
    let total = 0

    for (const item of selectedServices) {
      const service = item.service

      if (service.pricing_mode === 'SUPERVISOR_SET') {
        if (item.enteredPrice === '' || item.enteredPrice === null) {
          return null
        }

        const amount = Number(item.enteredPrice)
        if (!Number.isFinite(amount)) return null

        total += amount
        continue
      }

      const branchPrice = branchPrices.find(
        (price) =>
          Number(price.service) === Number(service.id) &&
          price.is_active
      )

      if (!branchPrice) return null

      if (service.pricing_mode === 'FIXED') {
        if (branchPrice.price === null) return null
        total += Number(branchPrice.price)
        continue
      }

      if (service.pricing_mode === 'VEHICLE_CATEGORY') {
        if (!selectedVehicleCategoryId) return null

        const categoryPrice = categoryPrices.find(
          (price) =>
            Number(price.branch_service_price) ===
              Number(branchPrice.id) &&
            Number(price.vehicle_category) ===
              Number(selectedVehicleCategoryId) &&
            price.is_active
        )

        if (!categoryPrice) return null
        total += Number(categoryPrice.price)
        continue
      }

      return null
    }

    return total
  }, [
    selectedServices,
    branchPrices,
    categoryPrices,
    selectedVehicleCategoryId,
  ])

  const selectedAssignmentCount = useMemo(
    () =>
      selectedServices.reduce(
        (total, item) => total + item.staffAssignments.length,
        0
      ),
    [selectedServices]
  )

  const selectedBranchName = canChooseBranch(role)
    ? branches.find(
        (branch) =>
          String(branch.id) === String(servicingBranchId)
      )?.name || ''
    : ownBranchName

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
  // LOAD BRANCH PRICING
  // ------------------------------------------------

  useEffect(() => {
    let active = true

    if (!effectiveBranchId || !canAddServices(role)) {
      setBranchPrices([])
      setCategoryPrices([])
      setLoadingPrices(false)

      return () => {
        active = false
      }
    }

    const loadPricing = async () => {
      setLoadingPrices(true)

      try {
        const [prices, categoryPriceResults] = await Promise.all([
          getBranchServicePrices({
            branch: effectiveBranchId,
          }),
          getBranchServiceCategoryPrices({
            branch: effectiveBranchId,
          }),
        ])

        if (!active) return

        setBranchPrices(prices.filter((item) => item.is_active))
        setCategoryPrices(
          categoryPriceResults.filter((item) => item.is_active)
        )
      } catch (loadError) {
        if (active) {
          setBranchPrices([])
          setCategoryPrices([])
          setError(
            `Unable to load branch service prices: ${getErrorMessage(loadError)}`
          )
        }
      } finally {
        if (active) setLoadingPrices(false)
      }
    }

    loadPricing()

    return () => {
      active = false
    }
  }, [role, effectiveBranchId])

  // ------------------------------------------------
  // LOAD STAFF FOR THE SERVICING BRANCH
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

        if (!active) return

        setBranchStaff(
          results.filter(
            (staff) =>
              staff.employment_status === 'ACTIVE' &&
              !staff.is_archived
          )
        )
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

        if (!active) return

        const uniqueModels = [
          ...new Set(
            results
              .map((vehicle) => vehicle.make_model?.trim())
              .filter(Boolean)
          ),
        ]

        setMakeModelSuggestions(uniqueModels.slice(0, 15))
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
    setSearch(normalizeRegistration(vehicle.registration_number))
    setVehicles([])
    setError('')
    setSuccess('')
  }

  const handleChangeVehicle = () => {
    setSelectedVehicle(null)
    setSearch('')
    setVehicles([])
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
          (category) =>
            Number(category.id) === Number(createdCategory.id)
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
  // SERVICE HANDLERS
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
      service.pricing_mode === 'SUPERVISOR_SET' &&
      role !== 'SUPERVISOR'
    ) {
      setError('Only a SUPERVISOR can add this service.')
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

    const priceInfo = getServicePriceInfo(service)

    if (!priceInfo.available) {
      setError(priceInfo.message)
      return
    }

    setSelectedServices((current) => [
      ...current,
      {
        service,
        staffAssignments: [],
        enteredPrice: '',
        zeroPriceReason: '',
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

  const handleToggleStaff = (serviceId, staffId) => {
    setSelectedServices((current) =>
      current.map((item) => {
        if (Number(item.service.id) !== Number(serviceId)) {
          return item
        }

        const id = Number(staffId)
        const existing = item.staffAssignments.some(
          (assignment) => Number(assignment.staffId) === id
        )

        return {
          ...item,
          staffAssignments: existing
            ? item.staffAssignments.filter(
                (assignment) => Number(assignment.staffId) !== id
              )
            : [
                ...item.staffAssignments,
                {
                  staffId: id,
                  shift: '',
                },
              ],
        }
      })
    )
  }

  const handleAssignmentShiftChange = (
    serviceId,
    staffId,
    shift,
  ) => {
    setSelectedServices((current) =>
      current.map((item) => {
        if (Number(item.service.id) !== Number(serviceId)) {
          return item
        }

        return {
          ...item,
          staffAssignments: item.staffAssignments.map((assignment) =>
            Number(assignment.staffId) === Number(staffId)
              ? { ...assignment, shift }
              : assignment
          ),
        }
      })
    )
  }

  const handleSupervisorPriceChange = (serviceId, value) => {
    setSelectedServices((current) =>
      current.map((item) =>
        Number(item.service.id) === Number(serviceId)
          ? { ...item, enteredPrice: value }
          : item
      )
    )
  }

  const handleZeroPriceReasonChange = (serviceId, value) => {
    setSelectedServices((current) =>
      current.map((item) =>
        Number(item.service.id) === Number(serviceId)
          ? { ...item, zeroPriceReason: value }
          : item
      )
    )
  }

  // ------------------------------------------------
  // FORM VALIDATION AND SUBMISSION
  // ------------------------------------------------

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (submitting) return

    setError('')
    setSuccess('')
    setCheckInCompleted(false)

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

    if (canChooseBranch(role) && !servicingBranchId) {
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
      setError(
        'Mat counts must be whole numbers of zero or greater.'
      )
      return
    }

    if (
      canAddServices(role) &&
      selectedServices.length === 0
    ) {
      setError('Add at least one service to this vehicle visit.')
      return
    }

    if (canAddServices(role) && loadingPrices) {
      setError('Wait for branch pricing to finish loading.')
      return
    }

    // Validate configured prices and supervisor-entered prices.
    for (const item of selectedServices) {
      const service = item.service

      if (service.pricing_mode === 'SUPERVISOR_SET') {
        if (role !== 'SUPERVISOR') {
          setError(
            `Only a SUPERVISOR can add ${service.name} and enter its price.`
          )
          return
        }

        if (
          item.enteredPrice === '' ||
          !Number.isFinite(Number(item.enteredPrice)) ||
          Number(item.enteredPrice) < 0
        ) {
          setError(`Enter a valid agreed price for ${service.name}.`)
          return
        }

        if (
          Number(item.enteredPrice) === 0 &&
          !item.zeroPriceReason.trim()
        ) {
          setError(
            `Enter a reason or promotion for the zero-priced ${service.name}.`
          )
          return
        }
      } else {
        const priceInfo = getServicePriceInfo(service)

        if (!priceInfo.available) {
          setError(`${service.name}: ${priceInfo.message}`)
          return
        }

        if (
          priceInfo.amount === 0 &&
          !priceInfo.reason.trim()
        ) {
          setError(
            `A reason or promotion must be configured for zero-priced ${service.name}.`
          )
          return
        }
      }
    }

    if (canAssignEmployees(role)) {
      if (loadingStaff) {
        setError(
          'Wait for the eligible employee list to finish loading.'
        )
        return
      }

      const unassignedServices = selectedServices.filter(
        (item) => item.staffAssignments.length === 0
      )

      if (unassignedServices.length > 0) {
        setError(
          `Assign at least one eligible employee to each service: ${unassignedServices
            .map((item) => item.service.name)
            .join(', ')}.`
        )
        return
      }

      for (const item of selectedServices) {
        const missingShift = item.staffAssignments.some(
          (assignment) =>
            !['DAY', 'NIGHT'].includes(assignment.shift)
        )

        if (missingShift) {
          setError(
            `Choose DAY or NIGHT shift for every assigned employee on ${item.service.name}.`
          )
          return
        }

        const expectedRole = getEligibleRole(item.service.category)

        const eligibleIds = branchStaff
          .filter((staff) => staff.role === expectedRole)
          .map((staff) => Number(staff.id))

        const invalidStaff = item.staffAssignments.some(
          (assignment) =>
            !eligibleIds.includes(Number(assignment.staffId))
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
      services: selectedServices.map((item) => {
        const servicePayload = {
          service_id: Number(item.service.id),
          staff_assignments: item.staffAssignments.map(
            (assignment) => ({
              staff_id: Number(assignment.staffId),
              shift: assignment.shift,
            })
          ),
        }

        if (item.service.pricing_mode === 'SUPERVISOR_SET') {
          servicePayload.price = Number(item.enteredPrice)

          if (Number(item.enteredPrice) === 0) {
            servicePayload.zero_price_reason =
              item.zeroPriceReason.trim()
          }
        }

        return servicePayload
      }),
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

      setCheckInCompleted(true)

      const vehicleRegistration =
        result.visit?.vehicle_registration ||
        selectedVehicle?.registration_number ||
        newVehicle.registration_number

      const visitNumber = result.visit?.id
      const serviceCount = result.services?.length || 0

      const assignmentCount = (
        result.services || []
      ).reduce(
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
      setShowOptionalVehicleFields(false)
      setShowReviewAndSubmit(false)
    } catch (submitError) {
      setCheckInCompleted(false)
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  const handleNewCheckIn = () => {
    setCheckInCompleted(false)
    setError('')
    setSuccess('')
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
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <CarFront size={25} />
        </div>

        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            NEV CARWASH Check-in
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Enter the vehicle, visit details and required services below.
          </p>
        </div>
      </header>

      {/* FEEDBACK */}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
        >
          <AlertCircle size={19} className="mt-0.5 shrink-0" />
          <p className="min-w-0 flex-1">{error}</p>

          <button
            type="button"
            onClick={() => setError('')}
            className="text-red-700 hover:text-red-900"
            aria-label="Dismiss error"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3.5 text-sm text-green-800"
        >
          <CheckCircle2 size={19} className="mt-0.5 shrink-0" />
          <p className="min-w-0 flex-1">{success}</p>

          <button
            type="button"
            onClick={() => setSuccess('')}
            className="text-green-700 hover:text-green-900"
            aria-label="Dismiss success message"
          >
            <X size={17} />
          </button>
        </div>
      )}

      {!checkInCompleted && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* VEHICLE */}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading
              icon={CarFront}
              title="1. Vehicle"
              description="Search for a registered vehicle or enter a new one."
            />

            <Field label="Vehicle registration number" required>
              <div className="relative">
                <Search
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  autoComplete="off"
                  value={search}
                  onChange={(event) =>
                    handleSearchChange(event.target.value)
                  }
                  placeholder="Enter registration, e.g. KDA123A"
                  className={`${inputClass} pl-10 uppercase`}
                />

                {searching && (
                  <Loader2
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-600"
                  />
                )}
              </div>
            </Field>

            {!selectedVehicle &&
              normalizedSearch.length > 0 &&
              normalizedSearch.length < 2 && (
                <p className="mt-2 text-xs text-slate-500">
                  Enter at least two characters to search.
                </p>
              )}

            {!selectedVehicle &&
              normalizedSearch.length >= 2 &&
              searching && (
                <p className="mt-2 text-xs text-slate-500">
                  Searching registered vehicles...
                </p>
              )}

            {!selectedVehicle &&
              !searching &&
              vehicles.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <div className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Matching vehicles
                  </div>

                  {vehicles.slice(0, 20).map((vehicle) => (
                    <button
                      key={vehicle.id}
                      type="button"
                      onClick={() => handleSelectVehicle(vehicle)}
                      disabled={!vehicle.is_active}
                      className={`flex w-full items-center justify-between gap-3 border-t border-slate-100 px-3 py-3 text-left ${
                        vehicle.is_active
                          ? 'hover:bg-blue-50'
                          : 'cursor-not-allowed bg-slate-50 opacity-60'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">
                          {vehicle.registration_number}
                        </span>

                        <span className="block truncate text-xs text-slate-500">
                          {vehicle.make_model || 'Make/model not recorded'}
                          {vehicle.category_name
                            ? ` ┬╖ ${vehicle.category_name}`
                            : ''}
                          {vehicle.branch_name
                            ? ` ┬╖ ${vehicle.branch_name}`
                            : ''}
                        </span>
                      </span>

                      <span className="shrink-0 text-xs font-semibold text-blue-700">
                        {vehicle.is_active ? 'Select' : 'Inactive'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

            {selectedVehicle && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-3.5">
                <div className="flex min-w-0 items-start gap-2.5">
                  <CheckCircle2
                    size={20}
                    className="mt-0.5 shrink-0 text-green-700"
                  />

                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                      Existing vehicle selected
                    </p>

                    <p className="mt-0.5 font-bold text-slate-900">
                      {selectedVehicle.registration_number}
                    </p>

                    <p className="text-sm text-slate-600">
                      {selectedVehicle.make_model || 'Make/model not recorded'}
                      {selectedVehicle.category_name
                        ? ` ┬╖ ${selectedVehicle.category_name}`
                        : ''}
                    </p>

                    {selectedVehicle.customer_name && (
                      <p className="mt-1 text-xs text-slate-500">
                        Customer: {selectedVehicle.customer_name}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleChangeVehicle}
                  className="rounded-lg border border-green-300 bg-white px-3 py-2 text-sm font-medium text-green-800 hover:bg-green-100"
                >
                  Change vehicle
                </button>
              </div>
            )}

            {/* NEW VEHICLE */}

            {showRegistrationForm && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3.5 sm:p-4">
                <div className="mb-4 flex items-center gap-2">
                  <UserPlus size={18} className="text-blue-700" />

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      New vehicle details
                    </h3>

                    <p className="text-xs text-slate-500">
                      The vehicle will be registered when the complete check-in is submitted.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Registration number" required>
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
                      className={`${inputClass} uppercase`}
                    />
                  </Field>

                  <Field label="Make / model" required>
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
                      className={inputClass}
                    />

                    <datalist id="vehicle-make-model-suggestions">
                      {makeModelSuggestions.map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>

                    {searchingModels && (
                      <p className="mt-1 text-xs text-slate-500">
                        Loading make/model suggestions...
                      </p>
                    )}
                  </Field>

                  <Field label="Vehicle category" required>
                    <select
                      required
                      value={newVehicle.category}
                      onChange={(event) =>
                        updateNewVehicle('category', event.target.value)
                      }
                      className={inputClass}
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
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                      >
                        <Plus size={14} />
                        Add a category
                      </button>
                    )}
                  </Field>

                  {showOptionalVehicleFields && canViewCustomers(role) && (
                    <Field label="Customer (optional)">
                      <select
                        value={selectedCustomerId}
                        onChange={(event) =>
                          setSelectedCustomerId(event.target.value)
                        }
                        className={inputClass}
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
                    </Field>
                  )}

                  {canChooseBranch(role) && (
                    <Field
                      label="Vehicle registration branch"
                      required
                    >
                      <select
                        required
                        value={registrationBranchId}
                        onChange={(event) =>
                          setRegistrationBranchId(event.target.value)
                        }
                        className={inputClass}
                      >
                        <option value="">Select branch</option>

                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}

                  {['SUPERVISOR', 'DETAILER'].includes(role) && (
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500">
                        Vehicle registration branch
                      </p>

                      <p className="mt-1 text-sm font-semibold text-slate-800">
                        {ownBranchName || 'Not assigned'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setShowOptionalVehicleFields((current) => !current)
                    }
                    aria-expanded={showOptionalVehicleFields}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  >
                    <Plus size={16} />
                    {showOptionalVehicleFields
                      ? 'Hide optional details'
                      : 'Add optional details'}
                  </button>
                </div>

                {showCategoryForm && canCreateCategory(role) && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
                    <Field label="New category name" required>
                      <input
                        value={newCategoryName}
                        onChange={(event) =>
                          setNewCategoryName(event.target.value)
                        }
                        placeholder="Enter category name"
                        className={inputClass}
                      />
                    </Field>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        disabled={
                          savingCategory || !newCategoryName.trim()
                        }
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {savingCategory ? 'Saving...' : 'Save category'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowCategoryForm(false)
                          setNewCategoryName('')
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {showOptionalVehicleFields && (
                  <>
                    {/* VEHICLE INSTRUCTIONS */}

                    <div className="mt-4 border-t border-blue-100 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vehicle instructions
                  </p>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
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

                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
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

                  <div className="mt-3">
                    <Field label="Special concerns (optional)">
                      <textarea
                        rows={2}
                        value={newVehicle.special_concerns}
                        onChange={(event) =>
                          updateNewVehicle(
                            'special_concerns',
                            event.target.value
                          )
                        }
                        placeholder="Special instructions or concerns about this vehicle"
                        className={inputClass}
                      />
                    </Field>
                    </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {!selectedVehicle &&
              !searching &&
              normalizedSearch.length >= 2 &&
              vehicles.length > 0 &&
              vehicles.every((vehicle) => !vehicle.is_active) && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  Matching records exist, but they are inactive. Ask an administrator to reactivate the correct vehicle instead of registering a duplicate.
                </p>
              )}

            {!selectedVehicle &&
              !searching &&
              normalizedSearch.length >= 2 &&
              vehicles.length === 0 &&
              !canCreateVehicle(role) && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  No matching vehicle was found. Your account cannot register a new vehicle. Ask an authorized staff member to register it.
                </p>
              )}
          </section>

          {/* SERVICES AND ASSIGNMENTS */}

          {canAddServices(role) && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <SectionHeading
                icon={Users}
                title="3. Services and employees"
                description="Add services using the selected branch's configured prices."
                trailing={
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                    {selectedServices.length} selected
                  </span>
                }
              />

              {!effectiveBranchId ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Select the servicing branch before adding services.
                </p>
              ) : loadingPrices ? (
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                  <Loader2 size={17} className="animate-spin" />
                  Loading branch service prices...
                </div>
              ) : (
                <>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <Field label="Choose a service">
                      {services.length === 0 ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                          No active services are available in the catalogue.
                        </p>
                      ) : availableServices.length === 0 ? (
                        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                          All services available to your role have been added.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <select
                            value={selectedServiceId}
                            onChange={(event) =>
                              setSelectedServiceId(event.target.value)
                            }
                            className={inputClass}
                          >
                            <option value="">Select a service</option>

                            {availableServices.map((service) => {
                              const info = getServicePriceInfo(service)

                              let priceLabel = info.available
                                ? info.amount === null
                                  ? 'Supervisor enters price'
                                  : formatKES(info.amount)
                                : info.message

                              return (
                                <option
                                  key={service.id}
                                  value={service.id}
                                  disabled={!info.available}
                                >
                                  {service.name} ┬╖ {getCategoryLabel(service.category)} ┬╖ {priceLabel}
                                </option>
                              )
                            })}
                          </select>

                          <button
                            type="button"
                            onClick={handleAddService}
                            disabled={!selectedServiceId}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus size={17} />
                            Add service
                          </button>
                        </div>
                      )}
                    </Field>

                    {selectedVehicleCategoryId && (
                      <p className="mt-2 text-xs text-slate-500">
                        Vehicle category selected: {
                          selectedVehicle?.category_name ||
                          categories.find(
                            (category) =>
                              Number(category.id) ===
                              Number(selectedVehicleCategoryId)
                          )?.name ||
                          'Selected category'
                        }
                      </p>
                    )}
                  </div>

                  {/* SELECTED SERVICES */}

                  <div className="mt-4">
                    {selectedServices.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center">
                        <ClipboardList
                          size={25}
                          className="mx-auto text-slate-400"
                        />

                        <p className="mt-2 text-sm font-medium text-slate-700">
                          No services added yet
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                          Choose a service above to add it to this visit.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedServices.map((item) => {
                          const service = item.service
                          const expectedRole = getEligibleRole(
                            service.category
                          )

                          const eligibleStaff = branchStaff.filter(
                            (staff) => staff.role === expectedRole
                          )

                          const priceInfo = getServicePriceInfo(service)

                          const displayedPrice =
                            service.pricing_mode === 'SUPERVISOR_SET'
                              ? item.enteredPrice === ''
                                ? 'Enter agreed price'
                                : formatKES(item.enteredPrice)
                              : priceInfo.available
                                ? formatKES(priceInfo.amount)
                                : 'Price unavailable'

                          return (
                            <article
                              key={service.id}
                              className="overflow-hidden rounded-lg border border-slate-200"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3">
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
                                    <Check size={17} />
                                  </div>

                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900">
                                      {service.name}
                                    </p>

                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {getCategoryLabel(service.category)}
                                      {service.code ? ` ┬╖ ${service.code}` : ''}
                                      {service.duration_minutes
                                        ? ` ┬╖ ${service.duration_minutes} minutes`
                                        : ''}
                                    </p>

                                    <p className="mt-1 text-xs text-slate-500">
                                      Pricing: {
                                        service.pricing_mode === 'FIXED'
                                          ? 'Branch fixed price'
                                          : service.pricing_mode === 'VEHICLE_CATEGORY'
                                            ? 'Vehicle category price'
                                            : 'Supervisor-entered price'
                                      }
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {displayedPrice}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveService(service.id)
                                    }
                                    title="Remove service"
                                    aria-label={`Remove ${service.name}`}
                                    className="rounded-lg border border-red-200 bg-white p-2 text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </div>

                              {/* SUPERVISOR-SET PRICE */}

                              {service.pricing_mode === 'SUPERVISOR_SET' &&
                                role === 'SUPERVISOR' && (
                                  <div className="border-t border-slate-200 p-3">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                      <Field
                                        label="Agreed TOP price (KES)"
                                        required
                                      >
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={item.enteredPrice}
                                          onChange={(event) =>
                                            handleSupervisorPriceChange(
                                              service.id,
                                              event.target.value
                                            )
                                          }
                                          placeholder="Enter agreed amount"
                                          className={inputClass}
                                        />
                                      </Field>

                                      {Number(item.enteredPrice) === 0 &&
                                        item.enteredPrice !== '' && (
                                          <Field
                                            label="Reason or promotion"
                                            required
                                          >
                                            <input
                                              value={item.zeroPriceReason}
                                              onChange={(event) =>
                                                handleZeroPriceReasonChange(
                                                  service.id,
                                                  event.target.value
                                                )
                                              }
                                              placeholder="Explain why this service is free"
                                              className={inputClass}
                                            />
                                          </Field>
                                        )}
                                    </div>

                                    <p className="mt-2 text-xs text-slate-500">
                                      This price is entered by the supervisor for this visit.
                                    </p>
                                  </div>
                                )}

                              {/* CONFIGURED ZERO-PRICE REASON */}

                              {service.pricing_mode !== 'SUPERVISOR_SET' &&
                                priceInfo.available &&
                                priceInfo.amount === 0 && (
                                  <div className="border-t border-slate-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    Zero-price reason: {priceInfo.reason}
                                  </div>
                                )}

                              {/* EMPLOYEE ASSIGNMENT */}

                              {canAssignEmployees(role) && (
                                <div className="p-3">
                                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">
                                        Assign employees
                                      </p>

                                      <p className="mt-0.5 text-xs text-slate-500">
                                        Select each employee and choose the shift for this assignment.
                                      </p>
                                    </div>

                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                                      <Users size={13} />
                                      {item.staffAssignments.length} selected
                                    </span>
                                  </div>

                                  {!effectiveBranchId ? (
                                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                                      Select the servicing branch first.
                                    </p>
                                  ) : loadingStaff ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                      <Loader2
                                        size={16}
                                        className="animate-spin"
                                      />
                                      Loading employees...
                                    </div>
                                  ) : !expectedRole ? (
                                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                                      The service category does not identify an eligible employee role.
                                    </p>
                                  ) : eligibleStaff.length === 0 ? (
                                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                      No active {expectedRole === 'CLEANER' ? 'cleaners' : 'detailers'} were found for this branch.
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {eligibleStaff.map((staff) => {
                                        const assignment =
                                          item.staffAssignments.find(
                                            (entry) =>
                                              Number(entry.staffId) ===
                                              Number(staff.id)
                                          )

                                        const checked = Boolean(assignment)

                                        return (
                                          <div
                                            key={staff.id}
                                            className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition ${
                                              checked
                                                ? 'border-blue-300 bg-blue-50'
                                                : 'border-slate-200 bg-white'
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
                                                  ? ` ┬╖ Current shift: ${staff.current_shift}`
                                                  : ''}
                                              </span>
                                            </span>

                                            {checked && (
                                              <div className="w-full sm:w-36">
                                                <select
                                                  value={assignment.shift}
                                                  onChange={(event) =>
                                                    handleAssignmentShiftChange(
                                                      service.id,
                                                      staff.id,
                                                      event.target.value
                                                    )
                                                  }
                                                  className={inputClass}
                                                  aria-label={`Shift for ${getStaffName(staff)}`}
                                                >
                                                  <option value="">
                                                    Select shift
                                                  </option>
                                                  <option value="DAY">
                                                    DAY
                                                  </option>
                                                  <option value="NIGHT">
                                                    NIGHT
                                                  </option>
                                                </select>
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}

                              {!canAssignEmployees(role) && (
                                <div className="p-3">
                                  <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                                    An ADMIN or SUPERVISOR will assign employees to this service.
                                  </p>
                                </div>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* SERVICE TOTAL */}

                  {selectedServices.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <p className="text-xs text-slate-500">
                          Configured service total
                        </p>

                        <p className="mt-0.5 text-lg font-bold text-slate-900">
                          {selectedServiceTotal === null
                            ? 'Pending price'
                            : formatKES(selectedServiceTotal)}
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500">
                          Based on the selected branch, vehicle category and any supervisor-entered prices.
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-slate-500">
                          Employee assignments
                        </p>

                        <p className="mt-0.5 text-lg font-bold text-slate-900">
                          {selectedAssignmentCount}
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* OWNER INFORMATION */}

          {role === 'OWNER' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              OWNER access can record a visit for an existing vehicle. Vehicle registration, service selection and employee assignment are handled by authorized operational staff.
            </div>
          )}

          {/* VISIT DETAILS */}

          <button
            type="button"
            onClick={() => setShowVisitDetails((current) => !current)}
            aria-expanded={showVisitDetails}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
          >
            <Plus
              size={18}
              className={`transition-transform ${
                showVisitDetails ? 'rotate-45' : ''
              }`}
            />
            {showVisitDetails ? 'Hide visit details' : 'Add visit details'}
          </button>

          {showVisitDetails && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading
              icon={ClipboardList}
              title="2. Visit details"
              description="Record the mats received and any instructions for this visit."
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Plastic mats received">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={plasticMatCount}
                  onChange={(event) =>
                    setPlasticMatCount(event.target.value)
                  }
                  className={inputClass}
                />
              </Field>

              <Field label="Woolen mats received">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={woolenMatCount}
                  onChange={(event) =>
                    setWoolenMatCount(event.target.value)
                  }
                  className={inputClass}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Visit comments (optional)">
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="Any additional instructions for this visit"
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
            </section>
          )}

          {/* REVIEW AND SUBMIT */}

          <button
            type="button"
            onClick={() =>
              setShowReviewAndSubmit((current) => !current)
            }
            aria-expanded={showReviewAndSubmit}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100"
          >
            <Plus
              size={18}
              className={`transition-transform ${
                showReviewAndSubmit ? 'rotate-45' : ''
              }`}
            />
            {showReviewAndSubmit
              ? 'Hide review and submit'
              : 'Review and submit'}
          </button>

          {showReviewAndSubmit && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <SectionHeading
              icon={CheckCircle2}
              title="4. Review and submit"
              description="Check the details before saving the vehicle visit."
            />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Vehicle</p>

                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {selectedVehicle
                    ? selectedVehicle.registration_number
                    : showRegistrationForm
                      ? newVehicle.registration_number || 'New vehicle'
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
                <p className="text-xs text-slate-500">Assignments</p>

                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {selectedAssignmentCount}
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Servicing branch</p>

                <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {selectedBranchName || 'Not selected'}
                </p>
              </div>
            </div>

            </section>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={
                submitting ||
                (canAssignEmployees(role) && loadingStaff) ||
                (canAddServices(role) && loadingPrices)
              }
              className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Saving check-in...
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} className="mr-2" />
                  {selectedVehicle
                    ? 'Submit vehicle visit'
                    : 'Register vehicle and submit visit'}
                </>
              )}
            </button>
            <p className="mt-2 text-center text-xs text-slate-500">
              All entered details are submitted together. The form resets only after a successful response.
            </p>
          </div>
        </form>
      )}

      {/* SUCCESSFUL CHECK-IN SCREEN */}

      {checkInCompleted && (
        <div className="rounded-xl border border-green-200 bg-white p-6 text-center shadow-sm">
          <CheckCircle2
            size={42}
            className="mx-auto text-green-600"
          />

          <h2 className="mt-3 text-lg font-bold text-slate-900">
            Check-in completed successfully
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            The vehicle visit has been saved. You can now start another check-in.
          </p>

          <button
            type="button"
            onClick={handleNewCheckIn}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={18} />
            New check-in
          </button>
        </div>
      )}
    </div>
  )
}

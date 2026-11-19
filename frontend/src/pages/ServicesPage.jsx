
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  CircleOff,
  Edit,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'
import { canPerform, getUserRole, ROLES } from '../config/rolePermissions'
import { getBranches } from '../api/branches'
import { getVehicleCategories } from '../api/vehicles'
import {
  getServices,
  createService,
  updateService,
  getBranchServicePrices,
  createBranchServicePrice,
  updateBranchServicePrice,
  getBranchServiceCategoryPrices,
  createBranchServiceCategoryPrice,
  updateBranchServiceCategoryPrice,
} from '../api/services'

const PRICING_MODES = [
  { value: 'FIXED', label: 'Fixed Branch Price' },
  { value: 'VEHICLE_CATEGORY', label: 'Vehicle Category Price' },
  { value: 'SUPERVISOR_SET', label: 'Supervisor Sets Price' },
]

const emptyServiceForm = {
  name: '',
  code: '',
  category: 'CAR_WASH',
  description: '',
  pricing_mode: 'FIXED',
  price: '0',
  duration_minutes: '',
  requires_timer: true,
  is_active: true,
}

const emptyBranchPriceForm = {
  price: '',
  zero_price_reason: '',
  is_active: true,
}

const emptyCategoryPriceForm = {
  vehicle_category: '',
  price: '',
  zero_price_reason: '',
  is_active: true,
}

const money = (value) => {
  if (value === null || value === undefined || value === '') return '—'

  return `KES ${Number(value).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const getErrorMessage = (error) => {
  const data = error?.response?.data

  if (!data) {
    return error?.message || 'Something went wrong. Please try again.'
  }

  if (typeof data === 'string') return data

  return Object.entries(data)
    .map(([field, messages]) => {
      const value = Array.isArray(messages)
        ? messages.join(' ')
        : typeof messages === 'object'
          ? JSON.stringify(messages)
          : String(messages)

      return `${field}: ${value}`
    })
    .join('\n')
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100'

export default function ServicesPage() {
  const { user } = useAuth()
  const role = getUserRole(user)
  const canManage = canPerform(user, 'services.manage')
  const isOwner = role === ROLES.OWNER

  const [services, setServices] = useState([])
  const [branches, setBranches] = useState([])
  const [categories, setCategories] = useState([])
  const [branchPrices, setBranchPrices] = useState([])
  const [categoryPrices, setCategoryPrices] = useState([])

  const [branchId, setBranchId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [serviceModalOpen, setServiceModalOpen] = useState(false)
  const [editingService, setEditingService] = useState(null)
  const [serviceForm, setServiceForm] = useState(emptyServiceForm)

  const [priceModalOpen, setPriceModalOpen] = useState(false)
  const [editingBranchPrice, setEditingBranchPrice] = useState(null)
  const [priceService, setPriceService] = useState(null)
  const [branchPriceForm, setBranchPriceForm] = useState(emptyBranchPriceForm)

  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategoryPrice, setEditingCategoryPrice] = useState(null)
  const [categoryPriceParent, setCategoryPriceParent] = useState(null)
  const [categoryPriceForm, setCategoryPriceForm] = useState(
    emptyCategoryPriceForm
  )

  const selectedBranch = useMemo(
    () => branches.find((branch) => String(branch.id) === String(branchId)),
    [branches, branchId]
  )

  const loadCatalogue = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [serviceRows, branchRows, categoryRows] = await Promise.all([
        getServices(),
        getBranches(),
        getVehicleCategories(),
      ])

      setServices(serviceRows)
      setBranches(branchRows)
      setCategories(categoryRows)

      if (!branchId && branchRows.length) {
        const profileBranch =
          user?.staff_profile?.branch ??
          user?.staff_profile?.branch_id ??
          user?.branch ??
          user?.branch_id

        const matchingBranch = branchRows.find(
          (branch) => String(branch.id) === String(profileBranch)
        )

        setBranchId(String(matchingBranch?.id ?? branchRows[0].id))
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [branchId, user])

  const loadPrices = useCallback(async () => {
    if (!branchId) {
      setBranchPrices([])
      setCategoryPrices([])
      return
    }

    try {
      const params = isOwner ? { branch: branchId } : {}

      const [priceRows, categoryPriceRows] = await Promise.all([
        getBranchServicePrices(params),
        getBranchServiceCategoryPrices(params),
      ])

      setBranchPrices(
        priceRows.filter(
          (item) => String(item.branch) === String(branchId)
        )
      )

      // branch_service_price is a primary-key value in the category-price
      // serializer, not a nested object. The API already applies branch scope.
      setCategoryPrices(categoryPriceRows)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }, [branchId, isOwner])

  useEffect(() => {
    loadCatalogue()
  }, [loadCatalogue])

  useEffect(() => {
    loadPrices()
  }, [loadPrices])

  const filteredServices = useMemo(() => {
    return services.filter((service) => {
      const matchesSearch =
        `${service.name} ${service.code} ${service.description || ''}`
          .toLowerCase()
          .includes(search.toLowerCase())

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && service.is_active) ||
        (statusFilter === 'INACTIVE' && !service.is_active)

      return matchesSearch && matchesStatus
    })
  }, [services, search, statusFilter])

  const getBranchPrice = (serviceId) =>
    branchPrices.find(
      (item) => String(item.service) === String(serviceId)
    )

  const getCategoryPrices = (branchPriceId) =>
    categoryPrices.filter(
      (item) =>
        String(item.branch_service_price) === String(branchPriceId)
    )

  const refreshAll = async () => {
    await loadCatalogue()
    await loadPrices()
  }

  const openCreateService = () => {
    setEditingService(null)
    setServiceForm(emptyServiceForm)
    setError('')
    setNotice('')
    setServiceModalOpen(true)
  }

  const openEditService = (service) => {
    setEditingService(service)
    setServiceForm({
      name: service.name || '',
      code: service.code || '',
      category: service.category || 'CAR_WASH',
      description: service.description || '',
      pricing_mode: service.pricing_mode || 'FIXED',
      price: String(service.price ?? '0'),
      duration_minutes: service.duration_minutes ?? '',
      requires_timer: Boolean(service.requires_timer),
      is_active: Boolean(service.is_active),
    })
    setError('')
    setNotice('')
    setServiceModalOpen(true)
  }

  const saveService = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    const payload = {
      ...serviceForm,
      price: serviceForm.price === '' ? '0' : serviceForm.price,
      duration_minutes:
        serviceForm.duration_minutes === ''
          ? null
          : Number(serviceForm.duration_minutes),
      requires_timer:
        serviceForm.category === 'DETAILING'
          ? false
          : serviceForm.requires_timer,
    }

    try {
      if (editingService) {
        // Pricing mode changes are deliberately not offered in edit mode.
        delete payload.pricing_mode

        await updateService(editingService.id, payload)
        setNotice('Service updated successfully.')
      } else {
        await createService(payload)
        setNotice('Service created. Configure its branch price below.')
      }

      setServiceModalOpen(false)
      await loadCatalogue()
      await loadPrices()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleServiceStatus = async (service) => {
    const action = service.is_active ? 'deactivate' : 'reactivate'

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${service.name}"?`
    )

    if (!confirmed) return

    setSaving(true)
    setError('')
    setNotice('')

    try {
      await updateService(service.id, {
        is_active: !service.is_active,
      })

      setServices((currentServices) =>
        currentServices.map((item) =>
          item.id === service.id
            ? { ...item, is_active: !service.is_active }
            : item
        )
      )

      setNotice(
        `${service.name} ${
          service.is_active ? 'deactivated' : 'reactivated'
        } successfully.`
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const openBranchPrice = (service) => {
    const existing = getBranchPrice(service.id)

    setPriceService(service)
    setEditingBranchPrice(existing || null)
    setBranchPriceForm({
      price: existing?.price ?? '',
      zero_price_reason: existing?.zero_price_reason ?? '',
      is_active: existing?.is_active ?? true,
    })
    setError('')
    setPriceModalOpen(true)
  }

  const saveBranchPrice = async (event) => {
    event.preventDefault()

    if (!branchId || !priceService) {
      setError('Select a branch before configuring prices.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    const isFixed = priceService.pricing_mode === 'FIXED'

    const payload = {
      branch: Number(branchId),
      service: Number(priceService.id),
      price: isFixed ? branchPriceForm.price : null,
      zero_price_reason: isFixed
        ? branchPriceForm.zero_price_reason.trim()
        : '',
      is_active: branchPriceForm.is_active,
    }

    try {
      if (editingBranchPrice) {
        await updateBranchServicePrice(editingBranchPrice.id, {
          price: payload.price,
          zero_price_reason: payload.zero_price_reason,
          is_active: payload.is_active,
        })
      } else {
        await createBranchServicePrice(payload)
      }

      setPriceModalOpen(false)
      setNotice('Branch pricing saved successfully.')
      await loadPrices()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const openCategoryPrice = (branchPrice, categoryPrice = null) => {
    setCategoryPriceParent(branchPrice)
    setEditingCategoryPrice(categoryPrice)

    setCategoryPriceForm({
      vehicle_category: categoryPrice?.vehicle_category ?? '',
      price: categoryPrice?.price ?? '',
      zero_price_reason: categoryPrice?.zero_price_reason ?? '',
      is_active: categoryPrice?.is_active ?? true,
    })

    setError('')
    setCategoryModalOpen(true)
  }

  const saveCategoryPrice = async (event) => {
    event.preventDefault()

    if (!categoryPriceParent) return

    setSaving(true)
    setError('')
    setNotice('')

    const payload = {
      branch_service_price: Number(categoryPriceParent.id),
      vehicle_category: Number(categoryPriceForm.vehicle_category),
      price: categoryPriceForm.price,
      zero_price_reason: categoryPriceForm.zero_price_reason.trim(),
      is_active: categoryPriceForm.is_active,
    }

    try {
      if (editingCategoryPrice) {
        await updateBranchServiceCategoryPrice(
          editingCategoryPrice.id,
          {
            price: payload.price,
            zero_price_reason: payload.zero_price_reason,
            is_active: payload.is_active,
          }
        )
      } else {
        await createBranchServiceCategoryPrice(payload)
      }

      setCategoryModalOpen(false)
      setNotice('Vehicle-category price saved successfully.')
      await loadPrices()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-8">
        <h2 className="text-lg font-bold text-slate-900">
          Access restricted
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Only an OWNER or ADMIN can manage services and pricing.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Services Management
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage the service catalogue and branch-specific pricing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshAll}
            disabled={loading || saving}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreateService}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
          >
            <Plus size={17} />
            Add Service
          </button>
        </div>
      </div>

      {error && (
        <div className="whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <Field label="Search services">
            <input
              className={inputClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by service name or code..."
            />
          </Field>

          <Field label="Service status">
            <select
              className={inputClass}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="ALL">All services</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-slate-900">Branch pricing</h2>
            <p className="text-sm text-slate-500">
              Configure the prices used when services are added to visits.
            </p>
          </div>

          <div className="w-full sm:w-72">
            <Field label="Branch">
              <select
                className={inputClass}
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {selectedBranch && (
          <p className="mb-4 text-sm text-slate-600">
            Showing prices for <strong>{selectedBranch.name}</strong>.
          </p>
        )}

        {!branchId ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            No active branch is available. Select or configure a branch first.
          </p>
        ) : (
          <div className="space-y-3">
            {services.map((service) => {
              const branchPrice = getBranchPrice(service.id)
              const rows = branchPrice
                ? getCategoryPrices(branchPrice.id)
                : []

              return (
                <div
                  key={service.id}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-slate-900">
                          {service.name}
                        </h3>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                          {service.code}
                        </span>
                        <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                          {service.pricing_mode}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-500">
                        {service.pricing_mode === 'FIXED'
                          ? `Branch price: ${money(branchPrice?.price)}`
                          : service.pricing_mode === 'VEHICLE_CATEGORY'
                            ? 'Price depends on vehicle category'
                            : 'Price entered by an authorised supervisor'}
                      </p>

                      {branchPrice && !branchPrice.is_active && (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          Branch pricing is inactive
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openBranchPrice(service)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Settings2 size={15} />
                        {branchPrice ? 'Edit branch price' : 'Set branch price'}
                      </button>

                      {service.pricing_mode === 'VEHICLE_CATEGORY' &&
                        branchPrice && (
                          <button
                            type="button"
                            onClick={() => openCategoryPrice(branchPrice)}
                            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                          >
                            <Plus size={15} />
                            Add category price
                          </button>
                        )}
                    </div>
                  </div>

                  {service.pricing_mode === 'VEHICLE_CATEGORY' &&
                    branchPrice && (
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          Vehicle category prices
                        </p>

                        {rows.length === 0 ? (
                          <p className="text-sm text-amber-700">
                            No category prices configured for this service.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {rows.map((row) => (
                              <div
                                key={row.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
                              >
                                <div>
                                  <span className="text-sm font-medium text-slate-800">
                                    {row.vehicle_category_name ||
                                      `Category ${row.vehicle_category}`}
                                  </span>
                                  <span className="ml-3 text-sm text-slate-600">
                                    {money(row.price)}
                                  </span>
                                  {!row.is_active && (
                                    <span className="ml-2 text-xs text-amber-700">
                                      Inactive
                                    </span>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    openCategoryPrice(branchPrice, row)
                                  }
                                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white"
                                >
                                  Edit
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 border-b border-slate-200 pb-4">
          <h2 className="font-bold text-slate-900">Service catalogue</h2>
          <p className="text-sm text-slate-500">
            {filteredServices.length} service(s) found
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Use the action buttons on each service to edit or change its status.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-500">
            <Loader2 className="animate-spin" size={20} />
            Loading services...
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No services match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {filteredServices.map((service) => (
              <article
                key={service.id}
                className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-base font-bold text-slate-900">
                      {service.name}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Code: {service.code}
                    </p>
                  </div>

                  {service.is_active ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 size={13} />
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      <CircleOff size={13} />
                      Inactive
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3">
                  <div>
                    <p className="text-xs text-slate-500">Category</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {service.category === 'CAR_WASH'
                        ? 'Car Wash'
                        : 'Detailing'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Pricing mode</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {PRICING_MODES.find(
                        (mode) => mode.value === service.pricing_mode
                      )?.label || service.pricing_mode}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Catalogue price</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {money(service.price)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-slate-500">Duration</p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {service.duration_minutes
                        ? `${service.duration_minutes} minutes`
                        : 'Not specified'}
                    </p>
                  </div>
                </div>

                {service.description && (
                  <p className="mt-3 break-words text-sm text-slate-600">
                    {service.description}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => openEditService(service)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Edit size={15} />
                    Edit
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => toggleServiceStatus(service)}
                    className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      service.is_active
                        ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {service.is_active ? (
                      <>
                        <CircleOff size={15} />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        Reactivate
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {serviceModalOpen && (
        <Modal
          title={editingService ? 'Edit Service' : 'Add Service'}
          onClose={() => setServiceModalOpen(false)}
        >
          <form onSubmit={saveService} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Service name">
                <input
                  required
                  className={inputClass}
                  value={serviceForm.name}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      name: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Service code">
                <input
                  required
                  maxLength={30}
                  className={inputClass}
                  value={serviceForm.code}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      code: event.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>

              <Field label="Category">
                <select
                  className={inputClass}
                  value={serviceForm.category}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      category: event.target.value,
                      requires_timer:
                        event.target.value === 'DETAILING'
                          ? false
                          : serviceForm.requires_timer,
                    })
                  }
                >
                  <option value="CAR_WASH">Car Wash</option>
                  <option value="DETAILING">Detailing</option>
                </select>
              </Field>

              <Field
                label="Pricing mode"
                hint={
                  editingService
                    ? 'Pricing mode cannot be changed here. Existing pricing records may prevent a change.'
                    : 'Choose how the visit price will be determined.'
                }
              >
                <select
                  className={inputClass}
                  disabled={Boolean(editingService)}
                  value={serviceForm.pricing_mode}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      pricing_mode: event.target.value,
                    })
                  }
                >
                  {PRICING_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="Catalogue price (KES)"
                hint="The catalogue field is retained by the backend. Actual visit prices use branch pricing rules."
              >
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={serviceForm.price}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      price: event.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Duration (minutes)">
                <input
                  type="number"
                  min="1"
                  className={inputClass}
                  value={serviceForm.duration_minutes}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      duration_minutes: event.target.value,
                    })
                  }
                  placeholder="Optional"
                />
              </Field>
            </div>

            <Field label="Description">
              <textarea
                rows={3}
                className={inputClass}
                value={serviceForm.description}
                onChange={(event) =>
                  setServiceForm({
                    ...serviceForm,
                    description: event.target.value,
                  })
                }
              />
            </Field>

            {serviceForm.category !== 'DETAILING' && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={serviceForm.requires_timer}
                  onChange={(event) =>
                    setServiceForm({
                      ...serviceForm,
                      requires_timer: event.target.checked,
                    })
                  }
                />
                Requires timer
              </label>
            )}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setServiceModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Service'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {priceModalOpen && priceService && (
        <Modal
          title={`Branch Price — ${priceService.name}`}
          onClose={() => setPriceModalOpen(false)}
        >
          <form onSubmit={saveBranchPrice} className="space-y-4">
            <p className="text-sm text-slate-600">
              Branch: <strong>{selectedBranch?.name || 'Selected branch'}</strong>
            </p>

            <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Pricing mode: <strong>{priceService.pricing_mode}</strong>
            </p>

            {priceService.pricing_mode === 'FIXED' ? (
              <>
                <Field label="Price (KES)">
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={branchPriceForm.price}
                    onChange={(event) =>
                      setBranchPriceForm({
                        ...branchPriceForm,
                        price: event.target.value,
                      })
                    }
                  />
                </Field>

                {Number(branchPriceForm.price) === 0 && (
                  <Field label="Reason or promotion (required for zero price)">
                    <input
                      required
                      maxLength={255}
                      className={inputClass}
                      value={branchPriceForm.zero_price_reason}
                      onChange={(event) =>
                        setBranchPriceForm({
                          ...branchPriceForm,
                          zero_price_reason: event.target.value,
                        })
                      }
                      placeholder="Explain why this service is free"
                    />
                  </Field>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-600">
                This pricing mode does not use a fixed branch-level amount.
                The branch price record will be saved with a blank price.
              </p>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={branchPriceForm.is_active}
                onChange={(event) =>
                  setBranchPriceForm({
                    ...branchPriceForm,
                    is_active: event.target.checked,
                  })
                }
              />
              Branch price is active
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setPriceModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Price'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {categoryModalOpen && categoryPriceParent && (
        <Modal
          title={
            editingCategoryPrice
              ? 'Edit Category Price'
              : 'Add Category Price'
          }
          onClose={() => setCategoryModalOpen(false)}
        >
          <form onSubmit={saveCategoryPrice} className="space-y-4">
            <p className="text-sm text-slate-600">
              Service: <strong>{categoryPriceParent.service_name}</strong>
            </p>

            <Field label="Vehicle category">
              <select
                required
                disabled={Boolean(editingCategoryPrice)}
                className={inputClass}
                value={categoryPriceForm.vehicle_category}
                onChange={(event) =>
                  setCategoryPriceForm({
                    ...categoryPriceForm,
                    vehicle_category: event.target.value,
                  })
                }
              >
                <option value="">Select vehicle category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Price (KES)">
              <input
                required
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={categoryPriceForm.price}
                onChange={(event) =>
                  setCategoryPriceForm({
                    ...categoryPriceForm,
                    price: event.target.value,
                  })
                }
              />
            </Field>

            {Number(categoryPriceForm.price) === 0 && (
              <Field label="Reason or promotion (required for zero price)">
                <input
                  required
                  maxLength={255}
                  className={inputClass}
                  value={categoryPriceForm.zero_price_reason}
                  onChange={(event) =>
                    setCategoryPriceForm({
                      ...categoryPriceForm,
                      zero_price_reason: event.target.value,
                    })
                  }
                  placeholder="Explain why this category price is free"
                />
              </Field>
            )}

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={categoryPriceForm.is_active}
                onChange={(event) =>
                  setCategoryPriceForm({
                    ...categoryPriceForm,
                    is_active: event.target.checked,
                  })
                }
              />
              Category price is active
            </label>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setCategoryModalOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Category Price'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}


import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Circle,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import {
  MapPin,
  Save,
  RefreshCw,
  LocateFixed,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

import { getBranches, updateBranch } from '../api/branches'

import 'leaflet/dist/leaflet.css'

import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const DEFAULT_CENTER = [-1.246902, 36.660771]

function LocationPicker({ position, setPosition }) {
  useMapEvents({
    click(event) {
      setPosition([
        event.latlng.lat,
        event.latlng.lng,
      ])
    },
  })

  return (
    <>
      <Marker
        position={position}
        draggable
        eventHandlers={{
          dragend(event) {
            const marker = event.target
            const coordinates = marker.getLatLng()

            setPosition([
              coordinates.lat,
              coordinates.lng,
            ])
          },
        }}
      />

      <Circle
        center={position}
        radius={0}
      />
    </>
  )
}

export default function BranchGPSSettingsPage() {
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [position, setPosition] = useState(DEFAULT_CENTER)
  const [radius, setRadius] = useState(100)
  const [hasCoordinates, setHasCoordinates] = useState(false)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const selectedBranch = branches.find(
    (branch) => String(branch.id) === String(selectedBranchId)
  )

  const loadBranches = async () => {
    try {
      setLoading(true)
      setError('')

      const data = await getBranches()

      setBranches(data)

      if (data.length > 0) {
        const branch = data.find(
          (item) => String(item.id) === String(selectedBranchId)
        ) || data[0]

        setSelectedBranchId(String(branch.id))
        setBranchLocation(branch)
      } else {
        setSelectedBranchId('')
        setHasCoordinates(false)
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        'Unable to load branches. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const setBranchLocation = (branch) => {
    const hasGPS =
      branch.latitude !== null &&
      branch.latitude !== undefined &&
      branch.longitude !== null &&
      branch.longitude !== undefined

    if (hasGPS) {
      setPosition([
        Number(branch.latitude),
        Number(branch.longitude),
      ])
      setHasCoordinates(true)
    } else {
      setPosition(DEFAULT_CENTER)
      setHasCoordinates(false)
    }

    setRadius(Number(branch.attendance_radius || 100))
    setSuccess('')
  }

  useEffect(() => {
    loadBranches()
  }, [])

  const handleBranchChange = (event) => {
    const id = event.target.value
    setSelectedBranchId(id)

    const branch = branches.find(
      (item) => String(item.id) === String(id)
    )

    if (branch) {
      setBranchLocation(branch)
    }
  }

  const handleSave = async () => {
    if (!selectedBranchId) return

    if (
      !Number.isFinite(position[0]) ||
      !Number.isFinite(position[1]) ||
      position[0] < -90 ||
      position[0] > 90 ||
      position[1] < -180 ||
      position[1] > 180
    ) {
      setError('Please select a valid GPS location on the map.')
      return
    }

    if (!Number.isInteger(Number(radius)) || Number(radius) < 1) {
      setError('Attendance radius must be at least 1 metre.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const updated = await updateBranch(selectedBranchId, {
        latitude: position[0].toFixed(7),
        longitude: position[1].toFixed(7),
        attendance_radius: Number(radius),
      })

      setBranches((previous) =>
        previous.map((branch) =>
          String(branch.id) === String(selectedBranchId)
            ? updated
            : branch
        )
      )

      setBranchLocation(updated)
      setSuccess('Branch GPS settings saved successfully.')
    } catch (err) {
      const responseData = err.response?.data

      setError(
        responseData?.detail ||
        responseData?.latitude?.[0] ||
        responseData?.longitude?.[0] ||
        responseData?.attendance_radius?.[0] ||
        'Failed to save GPS settings. Please try again.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading branch GPS settings...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="flex items-center gap-3">
          <MapPin className="h-7 w-7 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Branch GPS Settings
          </h1>
        </div>

        <p className="mt-2 text-sm text-gray-600">
          Set the official branch location and attendance geofence.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {success}
        </div>
      )}

      {branches.length === 0 ? (
        <div className="rounded-lg border bg-white p-6 text-gray-600">
          No active branches were found.
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-sm font-semibold text-gray-700">
              Select Branch
            </label>

            <select
              value={selectedBranchId}
              onChange={handleBranchChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-500"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name} — {branch.town}
                </option>
              ))}
            </select>

            {selectedBranch && (
              <p className="mt-2 text-sm text-gray-500">
                Branch code: {selectedBranch.code}
              </p>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b p-5">
              <h2 className="font-semibold text-gray-900">
                Branch Location Map
              </h2>

              <p className="mt-1 text-sm text-gray-600">
                Click on the map or drag the pin to set the branch location.
              </p>
            </div>

            <div className="h-[450px] w-full">
              <MapContainer
                key={selectedBranchId}
                center={position}
                zoom={17}
                scrollWheelZoom
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                <LocationPicker
                  position={position}
                  setPosition={setPosition}
                />

                <Circle
                  center={position}
                  radius={Number(radius)}
                  pathOptions={{
                    color: '#2563eb',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.15,
                  }}
                />
              </MapContainer>
            </div>

            <div className="grid gap-4 border-t p-5 md:grid-cols-2">
              <div>
                <p className="text-sm text-gray-500">Latitude</p>
                <p className="font-mono font-semibold">
                  {position[0].toFixed(7)}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Longitude</p>
                <p className="font-mono font-semibold">
                  {position[1].toFixed(7)}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <LocateFixed className="h-5 w-5 text-blue-600" />
              <h2 className="font-semibold text-gray-900">
                Attendance Geofence
              </h2>
            </div>

            <p className="mt-2 text-sm text-gray-600">
              Set the maximum distance from the branch at which staff can
              check in.
            </p>

            <div className="mt-5 flex items-center gap-3">
              <input
                type="number"
                min="1"
                max="5000"
                value={radius}
                onChange={(event) =>
                  setRadius(Number(event.target.value))
                }
                className="w-32 rounded-lg border border-gray-300 px-3 py-2"
              />

              <span className="text-sm text-gray-600">metres</span>
            </div>

            <input
              type="range"
              min="25"
              max="500"
              step="5"
              value={Math.min(500, Math.max(25, radius))}
              onChange={(event) =>
                setRadius(Number(event.target.value))
              }
              className="mt-4 w-full"
            />

            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>25 metres</span>
              <span>500 metres</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={loadBranches}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedBranchId}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save GPS Settings'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

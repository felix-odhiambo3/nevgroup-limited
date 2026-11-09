
import api from './client'

// Retrieve all staff members
export const getStaff = async () => {
  const response = await api.get('staff/')

  // Support both standard DRF arrays and paginated responses
  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

// Register a new staff member
export const registerStaff = async (staffData) => {
  const response = await api.post('staff/', staffData)
  return response.data
}

// Retrieve an individual staff profile
export const getStaffMember = async (staffId) => {
  const response = await api.get(`staff/${staffId}/`)
  return response.data
}

// Update an existing staff profile
export const updateStaff = async (staffId, staffData) => {
  const response = await api.patch(`staff/${staffId}/`, staffData)
  return response.data
}

// Retrieve a staff member's shift history
export const getStaffShiftHistory = async (staffId) => {
  const response = await api.get(`staff/${staffId}/shifts/`)

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

// Change a staff member's shift
export const changeStaffShift = async (staffId, shiftData) => {
  const response = await api.post(
    `staff/${staffId}/shifts/change/`,
    shiftData
  )

  return response.data
}

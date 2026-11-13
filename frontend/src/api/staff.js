
import api from './client'

// Retrieve all staff members.
export const getStaff = async () => {
  const response = await api.get('staff/')

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

// Register a new staff member.
export const registerStaff = async (staffData) => {
  const response = await api.post('staff/', staffData)
  return response.data
}

// Retrieve an individual staff profile.
export const getStaffMember = async (staffId) => {
  const response = await api.get(`staff/${staffId}/`)
  return response.data
}

// Update editable staff profile information.
export const updateStaff = async (staffId, staffData) => {
  const response = await api.patch(
    `staff/${staffId}/`,
    staffData
  )

  return response.data
}

// Retrieve a staff member's shift history.
export const getStaffShiftHistory = async (staffId) => {
  const response = await api.get(
    `staff/${staffId}/shifts/`
  )

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

// Change a staff member's shift.
export const changeStaffShift = async (staffId, shiftData) => {
  const response = await api.post(
    `staff/${staffId}/shifts/change/`,
    shiftData
  )

  return response.data
}

// Activate, deactivate, or archive a staff member.
export const updateStaffStatus = async (staffId, statusData) => {
  const response = await api.post(
    `staff/${staffId}/status/`,
    statusData
  )

  return response.data
}

// Retrieve a staff member's status history.
export const getStaffStatusHistory = async (staffId) => {
  const response = await api.get(
    `staff/${staffId}/status-history/`
  )

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

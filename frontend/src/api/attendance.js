
import api from './client'

// Retrieve attendance override requests.
// Optional filters: { status: 'PENDING' | 'APPROVED' | 'REJECTED' }
export const getAttendanceOverrides = async (filters = {}) => {
  const response = await api.get('attendance/overrides/', {
    params: filters,
  })

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

// Create a supervisor-assisted clock-in or clock-out request.
export const createAttendanceOverride = async (requestData) => {
  const response = await api.post(
    'attendance/overrides/',
    requestData
  )

  return response.data
}

// Retrieve one override request.
export const getAttendanceOverride = async (requestId) => {
  const response = await api.get(
    `attendance/overrides/${requestId}/`
  )

  return response.data
}

// Approve or reject an override request.
export const reviewAttendanceOverride = async (
  requestId,
  reviewData
) => {
  const response = await api.post(
    `attendance/overrides/${requestId}/review/`,
    reviewData
  )

  return response.data
}

// Execute an approved assisted attendance action.
export const executeAttendanceOverride = async (requestId) => {
  const response = await api.post(
    `attendance/overrides/${requestId}/execute/`
  )

  return response.data
}

// Retrieve the audit history for an override request.
export const getAttendanceOverrideAudit = async (requestId) => {
  const response = await api.get(
    `attendance/overrides/${requestId}/audit/`
  )

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

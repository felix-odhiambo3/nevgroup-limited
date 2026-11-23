
import api from './client'

// Retrieve support requests visible to the authenticated employee.
export const getStaffSupportRequests = async () => {
  const response = await api.get('staff-support-requests/')

  return Array.isArray(response.data)
    ? response.data
    : response.data.results || []
}

// Submit a new financial assistance request.
export const createStaffSupportRequest = async (requestData) => {
  const response = await api.post(
    'staff-support-requests/',
    requestData
  )

  return response.data
}

// Retrieve an individual support request.
export const getStaffSupportRequest = async (requestId) => {
  const response = await api.get(
    `staff-support-requests/${requestId}/`
  )

  return response.data
}

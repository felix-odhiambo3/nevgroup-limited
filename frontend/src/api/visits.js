
import api from './client'

const unwrapList = (data) => {
  if (Array.isArray(data)) return data
  return data?.results || []
}

export const getVisits = async (params = {}) => {
  const response = await api.get('visits/', { params })
  return unwrapList(response.data)
}

export const getVisit = async (visitId) => {
  const response = await api.get(`visits/${visitId}/`)
  return response.data
}

export const createVisit = async (visitData) => {
  const response = await api.post('visits/', visitData)
  return response.data
}

export const getVisitServices = async (visitId) => {
  const response = await api.get(`visits/${visitId}/services/`)
  return unwrapList(response.data)
}

export const addVisitService = async (visitId, serviceId) => {
  const response = await api.post(
    `visits/${visitId}/services/`,
    { service: serviceId }
  )
  return response.data
}

export const getServiceAssignments = async (visitId, visitServiceId) => {
  const response = await api.get(
    `visits/${visitId}/services/${visitServiceId}/assignments/`
  )
  return unwrapList(response.data)
}

export const assignStaff = async (visitId, visitServiceId, staffId) => {
  const response = await api.post(
    `visits/${visitId}/services/${visitServiceId}/assignments/`,
    { staff: staffId }
  )
  return response.data
}

export const removeStaffAssignment = async (
  visitId,
  visitServiceId,
  assignmentId,
  removalReason
) => {
  const response = await api.post(
    `visits/${visitId}/services/${visitServiceId}/assignments/${assignmentId}/remove/`,
    { removal_reason: removalReason }
  )
  return response.data
}

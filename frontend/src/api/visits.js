
import api from './client'

const unwrapList = (data) => {
  if (Array.isArray(data)) return data
  return data?.results || []
}

// --------------------------------------------------
// VISITS
// --------------------------------------------------

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

// --------------------------------------------------
// COMPLETE VEHICLE INTAKE WORKFLOW
// --------------------------------------------------

export const createVehicleIntakeWorkflow = async (workflowData) => {
  const response = await api.post(
    'visits/register-and-assign/',
    workflowData
  )

  return response.data
}

// --------------------------------------------------
// VISIT SERVICES
// --------------------------------------------------

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

// --------------------------------------------------
// SERVICE ASSIGNMENTS
// --------------------------------------------------

export const getServiceAssignments = async (
  visitId,
  visitServiceId
) => {
  const response = await api.get(
    `visits/${visitId}/services/${visitServiceId}/assignments/`
  )

  return unwrapList(response.data)
}

export const assignStaff = async (
  visitId,
  visitServiceId,
  staffId
) => {
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

// --------------------------------------------------
// ASSIGNMENT MONITORING
// --------------------------------------------------

export const getSupervisorAssignments = async (params = {}) => {
  const response = await api.get(
    'visits/monitor-assignments/',
    { params }
  )

  return response.data
}

export const reassignSupervisorAssignment = async (
  assignmentId,
  assignmentData
) => {
  const response = await api.post(
    `visits/monitor-assignments/${assignmentId}/reassign/`,
    assignmentData
  )

  return response.data
}

export const completeSupervisorAssignment = async (assignmentId) => {
  const response = await api.post(
    `visits/monitor-assignments/${assignmentId}/complete/`,
    {}
  )

  return response.data
}

export const removeSupervisorAssignment = async (
  assignmentId,
  assignmentData
) => {
  const response = await api.post(
    `visits/monitor-assignments/${assignmentId}/remove/`,
    assignmentData
  )

  return response.data
}

// --------------------------------------------------
// ADMIN / OWNER - COMPLETED ASSIGNMENT CORRECTIONS
// --------------------------------------------------

export const getAssignmentCorrections = async (assignmentId) => {
  const response = await api.get(
    `visits/assignments/${assignmentId}/corrections/`
  )

  return response.data
}

export const correctCompletedAssignment = async (
  assignmentId,
  correctionData
) => {
  const response = await api.post(
    `visits/assignments/${assignmentId}/corrections/`,
    correctionData
  )

  return response.data
}

// --------------------------------------------------
// MY DAY - CLEANER WORKSPACE
// --------------------------------------------------

export const getMyDay = async () => {
  const response = await api.get('visits/my-day/')
  return response.data
}

export const completeServiceAssignment = async (assignmentId) => {
  const response = await api.post(
    `visits/assignments/${assignmentId}/complete/`,
    {}
  )

  return response.data
}

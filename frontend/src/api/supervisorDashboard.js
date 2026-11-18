import api from './client'

export const getSupervisorWorkload = async (filters = {}) => {
  const response = await api.get('visits/monitor-workload/', {
    params: filters,
  })

  return response.data
}

export const getSupervisorAttendance = async (filters = {}) => {
  const response = await api.get('attendance/operations/', {
    params: filters,
  })

  return response.data
}

export const getSupervisorRevenue = async (filters = {}) => {
  const response = await api.get('payments/revenue-summary/', {
    params: filters,
  })

  return response.data
}
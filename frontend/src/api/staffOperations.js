
import api from './client'

const unwrapList = (data) => {
  if (Array.isArray(data)) return data
  return data?.results || []
}

export const getMyStaffProfile = async () => {
  const response = await api.get('staff/me/')
  return response.data
}

export const getBranchStaff = async (params = {}) => {
  const response = await api.get('staff/branch-picker/', { params })
  return unwrapList(response.data)
}


import api from './client'

const unwrapList = (data) => {
  if (Array.isArray(data)) return data
  return data?.results || []
}

export const getServices = async (params = {}) => {
  const response = await api.get('services/', { params })
  return unwrapList(response.data)
}

export const getService = async (serviceId) => {
  const response = await api.get(`services/${serviceId}/`)
  return response.data
}

export const createService = async (serviceData) => {
  const response = await api.post('services/', serviceData)
  return response.data
}

export const updateService = async (serviceId, serviceData) => {
  const response = await api.patch(`services/${serviceId}/`, serviceData)
  return response.data
}


import api from './client'

const unwrapList = (data) => {
  if (Array.isArray(data)) return data
  return data?.results || []
}

export const getVehicles = async (params = {}) => {
  const response = await api.get('vehicles/', { params })
  return unwrapList(response.data)
}

export const getVehicle = async (vehicleId) => {
  const response = await api.get(`vehicles/${vehicleId}/`)
  return response.data
}

export const registerVehicle = async (vehicleData) => {
  const response = await api.post('vehicles/', vehicleData)
  return response.data
}

export const updateVehicle = async (vehicleId, vehicleData) => {
  const response = await api.patch(`vehicles/${vehicleId}/`, vehicleData)
  return response.data
}

export const getCustomers = async (params = {}) => {
  const response = await api.get('vehicles/customers/', { params })
  return unwrapList(response.data)
}

export const registerCustomer = async (customerData) => {
  const response = await api.post('vehicles/customers/', customerData)
  return response.data
}

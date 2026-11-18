
import api from './client'

const unwrapList = (data) => {
  if (Array.isArray(data)) return data
  return data?.results || []
}

// Service catalogue

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

// Branch-level prices

export const getBranchServicePrices = async (params = {}) => {
  const response = await api.get('services/branch-prices/', { params })
  return unwrapList(response.data)
}

export const createBranchServicePrice = async (priceData) => {
  const response = await api.post('services/branch-prices/', priceData)
  return response.data
}

export const updateBranchServicePrice = async (priceId, priceData) => {
  const response = await api.patch(
    `services/branch-prices/${priceId}/`,
    priceData
  )
  return response.data
}

// Vehicle-category prices

export const getBranchServiceCategoryPrices = async (params = {}) => {
  const response = await api.get(
    'services/branch-category-prices/',
    { params }
  )
  return unwrapList(response.data)
}

export const createBranchServiceCategoryPrice = async (priceData) => {
  const response = await api.post(
    'services/branch-category-prices/',
    priceData
  )
  return response.data
}

export const updateBranchServiceCategoryPrice = async (
  priceId,
  priceData
) => {
  const response = await api.patch(
    `services/branch-category-prices/${priceId}/`,
    priceData
  )
  return response.data
}

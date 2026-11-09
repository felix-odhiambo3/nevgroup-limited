import api from './client'

export const getBranches = async () => {
  const response = await api.get('branches/')

  const branches = Array.isArray(response.data)
    ? response.data
    : response.data.results || []

  return branches.filter((branch) => branch.is_active)
}
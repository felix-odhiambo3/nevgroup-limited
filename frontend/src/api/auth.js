
import api from './client'

export const loginUser = async (credentials) => {
  const response = await api.post('auth/login/', credentials)

  const { access, refresh, user } = response.data

  sessionStorage.setItem('access_token', access)
  sessionStorage.setItem('refresh_token', refresh)

  return user
}

export const getCurrentUser = async () => {
  const response = await api.get('auth/me/')
  return response.data
}

export const logoutUser = async () => {
  const refresh = sessionStorage.getItem('refresh_token')

  try {
    if (refresh) {
      await api.post('auth/logout/', { refresh })
    }
  } finally {
    sessionStorage.clear()
  }
}

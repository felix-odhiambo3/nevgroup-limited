
import axios from 'axios'

const API_BASE_URL = 'http://127.0.0.1:8000/api/'

const clearAuthTokens = () => {
  sessionStorage.removeItem('access_token')
  sessionStorage.removeItem('refresh_token')
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const accessToken = sessionStorage.getItem('access_token')

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('auth/login/') &&
      !originalRequest.url?.includes('auth/refresh/') &&
      !originalRequest.url?.includes('auth/logout/')
    ) {
      const refreshToken = sessionStorage.getItem('refresh_token')

      if (!refreshToken) {
        clearAuthTokens()
        window.dispatchEvent(new Event('auth:logout'))
        return Promise.reject(error)
      }

      originalRequest._retry = true

      try {
        const response = await axios.post(
          `${API_BASE_URL}auth/refresh/`,
          { refresh: refreshToken }
        )

        const newAccessToken = response.data.access
        const newRefreshToken = response.data.refresh

        sessionStorage.setItem('access_token', newAccessToken)

        // SimpleJWT may rotate the refresh token.
        if (newRefreshToken) {
          sessionStorage.setItem('refresh_token', newRefreshToken)
        }

        originalRequest.headers.Authorization =
          `Bearer ${newAccessToken}`

        return api(originalRequest)
      } catch (refreshError) {
        clearAuthTokens()
        window.dispatchEvent(new Event('auth:logout'))

        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api

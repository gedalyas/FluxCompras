import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.response.use(
  (r) => r,
  (e) => {
    console.error('API error:', e?.response?.data || e.message)
    throw e
  }
)

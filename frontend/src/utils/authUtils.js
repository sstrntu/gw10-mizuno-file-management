import { signOut, supabase } from '../config/supabase'

const AUTH_ERROR_TYPES = new Set(['AUTH_REQUIRED', 'GOOGLE_AUTH_REQUIRED'])

export function isAuthErrorResponse(response, data = {}) {
  if (response?.status === 401) {
    return true
  }

  if (AUTH_ERROR_TYPES.has(data?.error_type)) {
    return true
  }

  const message = String(data?.error || data?.message || '').toLowerCase()

  return (
    message.includes('no google token') ||
    message.includes('login with google') ||
    message.includes('invalid credentials') ||
    message.includes('authentication required') ||
    message.includes('token expired')
  )
}

export async function forceRelogin() {
  try {
    await signOut()
  } catch {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Ignore local sign out failures and hard reload below.
    }
    window.location.reload()
  }
}

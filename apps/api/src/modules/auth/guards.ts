import { hasPermission, type Permission } from '@reprint/shared'
import type { preHandlerAsyncHookHandler } from 'fastify'
import { HttpProblem } from '../../errors.js'
import type { AuthContext } from './session-plugin.js'

function signedIn(auth: AuthContext | null): AuthContext {
  if (!auth) throw new HttpProblem(401, 'Sign in to continue.')
  return auth
}

/** 401 for Visitors. */
export const requireAuth: preHandlerAsyncHookHandler = async (request) => {
  signedIn(request.auth)
}

/** 401 for Visitors, 403 for Members who haven't verified their email (PRD §7.1). */
export const requireVerified: preHandlerAsyncHookHandler = async (request) => {
  const auth = signedIn(request.auth)
  if (!auth.user.emailVerifiedAt) {
    throw new HttpProblem(403, 'Verify your email address to do this.')
  }
}

/** 401 for Visitors, 403 without the permission. Checks the permission name, never a role. */
export function requirePermission(permission: Permission): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = signedIn(request.auth)
    if (!hasPermission(auth.permissions, permission)) {
      throw new HttpProblem(403, 'You do not have permission to do this.')
    }
  }
}

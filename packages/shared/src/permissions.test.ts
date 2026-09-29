import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  hasPermission,
  isPermission,
  MEMBER_PERMISSIONS,
  PERMISSIONS,
} from './permissions.js'

describe('permissions', () => {
  it('uses the names from PRD §4', () => {
    expect(PERMISSIONS.reviewsModerate).toBe('reviews.moderate')
    expect(PERMISSIONS.reportsResolve).toBe('reports.resolve')
    expect(PERMISSIONS.usersView).toBe('users.view')
    expect(PERMISSIONS.usersSuspend).toBe('users.suspend')
    expect(PERMISSIONS.rolesAssign).toBe('roles.assign')
    expect(PERMISSIONS.auditView).toBe('audit.view')
  })

  it('has unique names', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length)
  })

  it('keeps Member permissions free of elevated ones', () => {
    for (const p of MEMBER_PERMISSIONS) expect(ALL_PERMISSIONS).toContain(p)
    expect(MEMBER_PERMISSIONS).not.toContain(PERMISSIONS.reviewsModerate)
    expect(MEMBER_PERMISSIONS).not.toContain(PERMISSIONS.rolesAssign)
  })

  it('recognises permission names', () => {
    expect(isPermission('reviews.moderate')).toBe(true)
    expect(isPermission('admin')).toBe(false)
  })

  it('checks a granted set', () => {
    expect(hasPermission(['reviews.write'], PERMISSIONS.reviewsWrite)).toBe(true)
    expect(hasPermission(new Set(['reviews.write']), PERMISSIONS.reviewsModerate)).toBe(false)
    expect(hasPermission([], PERMISSIONS.auditView)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  hasPermission,
  isPermission,
  MEMBER_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from './permissions.js'

describe('permissions', () => {
  it('uses the names from PRD §4', () => {
    expect(PERMISSIONS.reviewsModerate).toBe('reviews.moderate')
    expect(PERMISSIONS.reportsResolve).toBe('reports.resolve')
    expect(PERMISSIONS.usersView).toBe('users.view')
    expect(PERMISSIONS.usersSuspend).toBe('users.suspend')
    expect(PERMISSIONS.rolesAssign).toBe('roles.assign')
    expect(PERMISSIONS.auditView).toBe('audit.view')
    expect(PERMISSIONS.catalogManage).toBe('catalog.manage')
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

  describe('role grants (PRD §4)', () => {
    it('gives Moderators the Member set plus moderation, reports, and limited user view', () => {
      expect(ROLE_PERMISSIONS[ROLES.moderator]).toEqual(MODERATOR_PERMISSIONS)
      expect(MODERATOR_PERMISSIONS).toContain(PERMISSIONS.reviewsModerate)
      expect(MODERATOR_PERMISSIONS).toContain(PERMISSIONS.reportsResolve)
      expect(MODERATOR_PERMISSIONS).toContain(PERMISSIONS.usersView)
      expect(MODERATOR_PERMISSIONS).not.toContain(PERMISSIONS.usersSuspend)
      expect(MODERATOR_PERMISSIONS).not.toContain(PERMISSIONS.rolesAssign)
      expect(MODERATOR_PERMISSIONS).not.toContain(PERMISSIONS.auditView)
    })

    it('gives Admins every permission and Members only the Member set', () => {
      expect(ROLE_PERMISSIONS[ROLES.admin]).toEqual(ALL_PERMISSIONS)
      expect(ROLE_PERMISSIONS[ROLES.member]).toEqual(MEMBER_PERMISSIONS)
    })
  })
})

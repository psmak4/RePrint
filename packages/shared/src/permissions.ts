/** Permission names (PRD §4). Code checks these, never role names. */
export const PERMISSIONS = {
  // Member
  reviewsWrite: 'reviews.write',
  reviewsVote: 'reviews.vote',
  reviewsReport: 'reviews.report',
  libraryManage: 'library.manage',
  profileManage: 'profile.manage',
  // Moderator
  reviewsModerate: 'reviews.moderate',
  reportsResolve: 'reports.resolve',
  usersView: 'users.view',
  // Admin
  usersSuspend: 'users.suspend',
  rolesAssign: 'roles.assign',
  auditView: 'audit.view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS)

export const MEMBER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.reviewsWrite,
  PERMISSIONS.reviewsVote,
  PERMISSIONS.reviewsReport,
  PERMISSIONS.libraryManage,
  PERMISSIONS.profileManage,
]

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value)
}

export function hasPermission(granted: Iterable<string>, needed: Permission): boolean {
  for (const name of granted) {
    if (name === needed) return true
  }
  return false
}

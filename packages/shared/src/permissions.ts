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

/** Role names seeded at launch (PRD §4). Code never checks these; it checks permissions. */
export const ROLES = {
  member: 'member',
  moderator: 'moderator',
  admin: 'admin',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export const MODERATOR_PERMISSIONS: readonly Permission[] = [
  ...MEMBER_PERMISSIONS,
  PERMISSIONS.reviewsModerate,
  PERMISSIONS.reportsResolve,
  PERMISSIONS.usersView,
]

/** The permission grants of the PRD §4 table. The accounts data migration seeds exactly these. */
export const ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = {
  [ROLES.member]: MEMBER_PERMISSIONS,
  [ROLES.moderator]: MODERATOR_PERMISSIONS,
  [ROLES.admin]: ALL_PERMISSIONS,
}

/** Account statuses (PRD §9). */
export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

/** What an `auth_tokens` row is for (PRD §9). */
export const AUTH_TOKEN_PURPOSES = ['verify_email', 'reset_password', 'change_email'] as const
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number]

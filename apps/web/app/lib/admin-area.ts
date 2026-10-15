import { PERMISSIONS } from '@reprint/shared'

/** Holding any of these opens the admin area; each page then checks its own permission. */
export const ADMIN_AREA_PERMISSIONS: readonly string[] = [
  PERMISSIONS.reviewsModerate,
  PERMISSIONS.reportsResolve,
  PERMISSIONS.usersView,
  PERMISSIONS.auditView,
  PERMISSIONS.catalogManage,
  PERMISSIONS.featuredManage,
]

/** Whether the viewer can open the admin area, so the account menu offers it. */
export function canOpenAdmin(permissions: readonly string[]): boolean {
  return ADMIN_AREA_PERMISSIONS.some((permission) => permissions.includes(permission))
}

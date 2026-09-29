import { AUTH_TOKEN_PURPOSES, USER_STATUSES } from '@reprint/shared'
import { sql } from 'drizzle-orm'
import { boolean, check, index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { covers } from './covers.js'
import { citext, timestamps, timestamptz, uuidv7Pk } from './helpers.js'

/** Accounts (PRD §9). */
export const users = pgTable(
  'users',
  {
    id: uuidv7Pk(),
    email: citext('email').notNull().unique(),
    username: citext('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamptz('email_verified_at'),
    displayName: text('display_name').notNull(),
    bio: text('bio'),
    avatarId: uuid('avatar_id').references(() => covers.id, { onDelete: 'set null' }),
    libraryPublic: boolean('library_public').notNull().default(true),
    /** D-032: the only optional email; security emails always send. */
    emailReviewDecisions: boolean('email_review_decisions').notNull().default(true),
    status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
    suspendedUntil: timestamptz('suspended_until'),
    deletedAt: timestamptz('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    check('users_status_check', sql`${t.status} in ('active', 'suspended', 'deleted')`),
    check('users_bio_length_check', sql`char_length(${t.bio}) <= 280`),
    index('users_avatar_id_idx').on(t.avatarId),
  ],
)

export const roles = pgTable('roles', {
  id: uuidv7Pk(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
})

export const permissions = pgTable('permissions', {
  id: uuidv7Pk(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
})

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permissionId] }),
    index('role_permissions_permission_id_idx').on(t.permissionId),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    grantedAt: timestamptz('granted_at').notNull().default(sql`now()`),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roleId] }),
    index('user_roles_role_id_idx').on(t.roleId),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: uuidv7Pk(),
    /** SHA-256 of the cookie token; the token itself is never stored (M2-T02). */
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamptz('expires_at').notNull(),
    lastSeenAt: timestamptz('last_seen_at').notNull().default(sql`now()`),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)

export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuidv7Pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    purpose: text('purpose', { enum: AUTH_TOKEN_PURPOSES }).notNull(),
    /** The address an email change will switch to (`change_email` only). */
    newEmail: citext('new_email'),
    expiresAt: timestamptz('expires_at').notNull(),
    usedAt: timestamptz('used_at'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [
    index('auth_tokens_user_id_idx').on(t.userId),
    check(
      'auth_tokens_purpose_check',
      sql`${t.purpose} in ('verify_email', 'reset_password', 'change_email')`,
    ),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: uuidv7Pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    readAt: timestamptz('read_at'),
    createdAt: timestamptz('created_at').notNull().default(sql`now()`),
  },
  (t) => [index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

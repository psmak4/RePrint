-- Roles, permissions, and grants from PRD §4. Mirrors ROLE_PERMISSIONS in packages/shared
-- (an integration test compares the two). IDs use Postgres 18's native uuidv7().
INSERT INTO "roles" ("id", "name", "description") VALUES
	(uuidv7(), 'member', 'A registered account'),
	(uuidv7(), 'moderator', 'Reviews content (reviews and reports)'),
	(uuidv7(), 'admin', 'Full access, including user and role management');
--> statement-breakpoint
INSERT INTO "permissions" ("id", "name", "description") VALUES
	(uuidv7(), 'reviews.write', 'Write, edit, and delete own reviews'),
	(uuidv7(), 'reviews.vote', 'Vote a review helpful'),
	(uuidv7(), 'reviews.report', 'Report a review'),
	(uuidv7(), 'library.manage', 'Manage own library'),
	(uuidv7(), 'profile.manage', 'Manage own profile'),
	(uuidv7(), 'reviews.moderate', 'Approve, reject, and unpublish reviews'),
	(uuidv7(), 'reports.resolve', 'Handle review reports'),
	(uuidv7(), 'users.view', 'Search users and view account details'),
	(uuidv7(), 'users.suspend', 'Suspend, unsuspend, and force logout'),
	(uuidv7(), 'roles.assign', 'Grant or remove roles'),
	(uuidv7(), 'audit.view', 'Read the audit log');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON (
	(r."name" = 'member' AND p."name" IN ('reviews.write', 'reviews.vote', 'reviews.report', 'library.manage', 'profile.manage'))
	OR (r."name" = 'moderator' AND p."name" IN ('reviews.write', 'reviews.vote', 'reviews.report', 'library.manage', 'profile.manage', 'reviews.moderate', 'reports.resolve', 'users.view'))
	OR (r."name" = 'admin')
);

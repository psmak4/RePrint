-- `catalog.manage` (PRD §7.11, D-045): Admins edit, refresh, merge, and manage Genres. Mirrors ROLE_PERMISSIONS.
INSERT INTO "permissions" ("id", "name", "description") VALUES
	(uuidv7(), 'catalog.manage', 'Edit the Catalog, refresh and merge Books, and manage Genres');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" = 'catalog.manage'
WHERE r."name" = 'admin';

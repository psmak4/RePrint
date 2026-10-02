-- `featured.manage` (Moderator, Admin) and `featured.genres` (Admin) (PRD §7.2, §7.11, D-045). Mirrors ROLE_PERMISSIONS.
INSERT INTO "permissions" ("id", "name", "description") VALUES
	(uuidv7(), 'featured.manage', 'Choose the featured review on Discover'),
	(uuidv7(), 'featured.genres', 'Choose the featured Genres on Discover');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" = 'featured.manage'
WHERE r."name" IN ('moderator', 'admin');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" = 'featured.genres'
WHERE r."name" = 'admin';

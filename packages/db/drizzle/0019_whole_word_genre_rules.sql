-- Genre rules now match whole words (D-190). These two forms used to be caught by the substring
-- matches 'humor' and 'teen'; they keep the same Genres. A rule an admin already added is kept.
INSERT INTO "subject_genre_rules" ("id", "pattern", "genre_id", "priority")
SELECT uuidv7(), v."pattern", g."id", v."priority"
FROM (VALUES
	('humorous', 'humor-satire', 20),
	('teenagers', 'young-adult', 20)
) AS v("pattern", "slug", "priority")
JOIN "genres" g ON g."slug" = v."slug"
ON CONFLICT ("pattern", "genre_id") DO NOTHING;

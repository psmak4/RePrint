import type postgres from 'postgres'

export interface ConventionViolation {
  rule: 'fk-index' | 'timestamptz'
  table: string
  detail: string
}

/**
 * Checks the PRD §9 conventions against a live schema: every foreign key is covered by an index
 * (the FK columns lead a non-partial index), and no column is a `timestamp` without time zone.
 */
export async function findConventionViolations(
  sql: postgres.Sql,
  schema = 'public',
): Promise<ConventionViolation[]> {
  const unindexed = await sql<{ table: string; constraint: string }[]>`
    select c.conrelid::regclass::text as "table", c.conname as "constraint"
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f'
      and n.nspname = ${schema}
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indpred is null
          and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] = c.conkey
      )
    order by 1, 2`

  const naive = await sql<{ table: string; column: string }[]>`
    select table_name as "table", column_name as "column"
    from information_schema.columns
    where table_schema = ${schema}
      and data_type = 'timestamp without time zone'
    order by 1, 2`

  return [
    ...unindexed.map((row) => ({
      rule: 'fk-index' as const,
      table: row.table,
      detail: `foreign key ${row.constraint} has no index`,
    })),
    ...naive.map((row) => ({
      rule: 'timestamptz' as const,
      table: row.table,
      detail: `column ${row.column} is timestamp without time zone; use timestamptz`,
    })),
  ]
}

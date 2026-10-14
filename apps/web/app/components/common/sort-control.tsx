import { Button, Select } from '@reprint/ui'
import { type ChangeEvent, useId, useState } from 'react'
import { Form, useSubmit } from 'react-router'
import { copy } from '../../copy/index.js'

/**
 * The one sort control (D-214): "Sort by" and the compact dropdown, in a GET form that keeps the
 * page's other choices. A choice applies at once through React Router, with focus left on the
 * dropdown and the scroll position kept; without JavaScript, an Apply button submits the form.
 */
export function SortControl<T extends string>({
  action,
  anchor,
  name = 'sort',
  value,
  options,
  optionLabel,
  keep = {},
}: {
  /** The page's path; the form submits to it. */
  action: string
  /** Where a submission without JavaScript lands on the page, such as `reviews`. */
  anchor?: string
  name?: string
  value: T
  options: readonly T[]
  optionLabel: (option: T) => string
  /** The page's other query values that a new sort keeps. */
  keep?: Record<string, string | number | undefined>
}) {
  const id = useId()
  const submit = useSubmit()
  // The shown choice follows the URL (Back, a new link) and updates at once on a pick.
  const [selected, setSelected] = useState(value)
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setSelected(value)
  }
  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelected(event.target.value as T)
    submit(event.currentTarget.form, { action, preventScrollReset: true })
  }
  return (
    <Form
      method="get"
      action={anchor ? `${action}#${anchor}` : action}
      className="flex items-center gap-2.5"
    >
      {Object.entries(keep).map(([key, kept]) =>
        kept === undefined || kept === '' ? null : (
          <input key={key} type="hidden" name={key} value={String(kept)} />
        ),
      )}
      <label htmlFor={id} className="text-sm text-muted-foreground">
        {copy.shell.sortLabel}
      </label>
      <Select compact id={id} name={name} value={selected} onChange={onChange}>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel(option)}
          </option>
        ))}
      </Select>
      <noscript>
        <Button type="submit" variant="outline" size="sm">
          {copy.shell.applySort}
        </Button>
      </noscript>
    </Form>
  )
}

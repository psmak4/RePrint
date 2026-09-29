import { render } from '@react-email/render'
import { type ComponentType, createElement } from 'react'
import { type EmailProps, type EmailTemplateName, emailTemplates } from './templates.js'

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/** Validates the props, then renders the template to HTML and a plain-text alternative. */
export async function renderEmail<Name extends EmailTemplateName>(
  name: Name,
  props: EmailProps<Name>,
): Promise<RenderedEmail> {
  const template = emailTemplates[name]
  const parsed = template.props.parse(props)
  // The component type is a union over every template; `parsed` matches this template's props.
  const element = createElement(template.component as ComponentType<typeof parsed>, parsed)
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject: template.subject(), html, text }
}

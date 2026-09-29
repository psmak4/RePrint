import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components'
import type { ReactNode } from 'react'

const colors = { page: '#0f172a', card: '#ffffff', text: '#0f172a', muted: '#64748b' }

export interface BaseLayoutProps {
  /** Shown by mail clients next to the subject. */
  preview: string
  heading: string
  children: ReactNode
}

/** Shared frame for every email: brand header, content card, and footer. */
export function BaseLayout({ preview, heading, children }: BaseLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: colors.page,
          margin: 0,
          padding: '24px 0',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <Container style={{ maxWidth: 560, margin: '0 auto' }}>
          <Text style={{ color: '#f8fafc', fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>
            RePrint
          </Text>
          <Container
            style={{
              backgroundColor: colors.card,
              borderRadius: 8,
              padding: 24,
              color: colors.text,
            }}
          >
            <Heading as="h1" style={{ fontSize: 22, margin: '0 0 16px' }}>
              {heading}
            </Heading>
            {children}
            <Hr style={{ borderColor: '#e2e8f0', margin: '24px 0 12px' }} />
            <Text style={{ color: colors.muted, fontSize: 12, margin: 0 }}>
              You are receiving this email because of activity on your RePrint account.
            </Text>
          </Container>
        </Container>
      </Body>
    </Html>
  )
}

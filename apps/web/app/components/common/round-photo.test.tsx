// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemberAvatar } from './member-avatar.js'

afterEach(cleanup)

describe('MemberAvatar (D-214)', () => {
  it('shows the photo, and the initials in the same frame when it fails to load', () => {
    render(<MemberAvatar url="https://example.test/a.webp" name="Ada Lovelace" username="ada" />)
    const photo = screen.getByRole('img', { name: "Ada Lovelace's avatar" })
    expect(photo.tagName).toBe('IMG')
    fireEvent.error(photo)
    const fallback = screen.getByRole('img', { name: "Ada Lovelace's avatar" })
    expect(fallback.tagName).toBe('DIV')
    expect(fallback.textContent).toBe('AL')
  })

  it('shows the initials when there is no photo, coloured by the username', () => {
    const { rerender } = render(<MemberAvatar url={null} name="Ada Lovelace" username="ada" />)
    const colour = screen.getByRole('img').className
    rerender(<MemberAvatar url={null} name="Someone Else" username="ada" />)
    expect(screen.getByRole('img').className).toBe(colour)
  })

  it('tries a new photo after the last one failed', () => {
    const { rerender } = render(
      <MemberAvatar url="https://example.test/a.webp" name="Ada" username="ada" />,
    )
    fireEvent.error(screen.getByRole('img'))
    rerender(<MemberAvatar url="https://example.test/b.webp" name="Ada" username="ada" />)
    expect(screen.getByRole('img').tagName).toBe('IMG')
  })
})

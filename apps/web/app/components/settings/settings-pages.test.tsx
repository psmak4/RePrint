// @vitest-environment jsdom
import type { Me } from '@reprint/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRoutesStub, data } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../../copy/index.js'
import { ProfileSettingsPage } from './profile-settings-page.js'

// jsdom's File can't be turned into a Request under vitest (its FormData shim fails on any Blob),
// so the avatar form's submit is recorded here and replayed without the file.
const submitted: { target: unknown; options: unknown }[] = []
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useFetcher: (...args: Parameters<typeof actual.useFetcher>) => {
      const fetcher = actual.useFetcher(...args)
      return {
        ...fetcher,
        submit: (target: unknown, options: Record<string, unknown>) => {
          submitted.push({ target, options })
          const replay = target instanceof FormData ? new URLSearchParams() : target
          return fetcher.submit(replay as never, options as never)
        },
      }
    },
  }
})

afterEach(() => {
  cleanup()
  submitted.length = 0
})

const me: Me = {
  id: '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b',
  email: 'reader@example.com',
  username: 'reader',
  displayName: 'Reader One',
  bio: 'Loves long novels.',
  avatarUrl: null,
  verified: true,
  libraryPublic: true,
  emailReviewDecisions: true,
}

function renderPage(
  actions: { profile?: (body: unknown) => unknown; avatar?: (form: FormData) => unknown } = {},
  member: Me = me,
) {
  const Stub = createRoutesStub([
    {
      path: '/settings/profile',
      Component: () => <ProfileSettingsPage me={member} />,
      action: async ({ request }) =>
        (actions.profile ?? (() => ({ saved: true })))(await request.json()),
    },
    {
      path: '/settings/avatar',
      action: async ({ request }) =>
        (actions.avatar ?? (() => ({ avatarUrl: 'http://img/new.webp' })))(
          await request.formData(),
        ),
    },
  ])
  return render(<Stub initialEntries={['/settings/profile']} />)
}

describe('profile form', () => {
  it('starts from the saved profile and counts the bio', () => {
    renderPage()
    expect(
      (screen.getByLabelText(copy.settings.profile.displayNameLabel) as HTMLInputElement).value,
    ).toBe('Reader One')
    expect(screen.getByText(copy.settings.profile.bioCounter(18, 280))).toBeTruthy()
    fireEvent.change(screen.getByLabelText(copy.settings.profile.bioLabel), {
      target: { value: 'Hi' },
    })
    expect(screen.getByText(copy.settings.profile.bioCounter(2, 280))).toBeTruthy()
  })

  it('refuses a bio over 280 characters without calling the server', async () => {
    const profile = vi.fn(() => ({ saved: true }))
    renderPage({ profile })
    fireEvent.change(screen.getByLabelText(copy.settings.profile.bioLabel), {
      target: { value: 'x'.repeat(281) },
    })
    fireEvent.click(screen.getByRole('button', { name: copy.settings.profile.save }))
    expect((await screen.findByRole('alert')).textContent).toContain('280')
    expect(profile).not.toHaveBeenCalled()
  })

  it('toggles library privacy and review-decision emails and saves them', async () => {
    const profile = vi.fn(() => ({ saved: true }))
    renderPage({ profile })
    fireEvent.click(screen.getByLabelText(copy.settings.profile.libraryPublicLabel))
    fireEvent.click(screen.getByLabelText(copy.settings.profile.emailDecisionsLabel))
    fireEvent.click(screen.getByRole('button', { name: copy.settings.profile.save }))
    expect(await screen.findByText(copy.settings.profile.saved)).toBeTruthy()
    expect(profile).toHaveBeenCalledWith({
      displayName: 'Reader One',
      bio: 'Loves long novels.',
      libraryPublic: false,
      emailReviewDecisions: false,
    })
  })

  it('sends an emptied bio as null and shows server field errors', async () => {
    const profile = vi.fn(() => data({ fieldErrors: { displayName: 'Taken.' } }, { status: 400 }))
    renderPage({ profile })
    fireEvent.change(screen.getByLabelText(copy.settings.profile.bioLabel), {
      target: { value: '  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: copy.settings.profile.save }))
    expect((await screen.findByRole('alert')).textContent).toBe('Taken.')
    expect(profile).toHaveBeenCalledWith(expect.objectContaining({ bio: null }))
  })
})

describe('avatar form', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
  })

  const pick = (file: File) =>
    fireEvent.change(screen.getByLabelText(copy.settings.avatar.fileLabel), {
      target: { files: [file] },
    })

  it('shows the current avatar, then a preview of the chosen file', () => {
    renderPage({}, { ...me, avatarUrl: 'http://img/old.webp' })
    expect(screen.getByAltText(copy.settings.avatar.currentAlt).getAttribute('src')).toBe(
      'http://img/old.webp',
    )
    pick(new File(['x'], 'me.png', { type: 'image/png' }))
    expect(screen.getByAltText(copy.settings.avatar.previewAlt).getAttribute('src')).toBe(
      'blob:preview',
    )
  })

  it('asks for a file before uploading', async () => {
    const avatar = vi.fn(() => ({ avatarUrl: 'x' }))
    renderPage({ avatar })
    fireEvent.click(screen.getByRole('button', { name: copy.settings.avatar.upload }))
    expect((await screen.findByRole('alert')).textContent).toBe(copy.settings.avatar.chooseFile)
    expect(avatar).not.toHaveBeenCalled()
  })

  it('uploads the chosen file and confirms', async () => {
    const avatar = vi.fn(() => ({ avatarUrl: 'http://img/new.webp' }))
    renderPage({ avatar })
    pick(new File(['x'], 'me.png', { type: 'image/png' }))
    fireEvent.click(screen.getByRole('button', { name: copy.settings.avatar.upload }))
    expect(await screen.findByText(copy.settings.avatar.uploaded)).toBeTruthy()
    expect(avatar).toHaveBeenCalled()
    const sent = submitted[0]
    expect(sent).toBeDefined()
    expect((sent?.target as FormData | undefined)?.get('file')).toBeInstanceOf(File)
    expect(sent?.options).toEqual({
      method: 'post',
      action: '/settings/avatar',
      encType: 'multipart/form-data',
    })
  })

  it('shows the server message when the upload is refused', async () => {
    renderPage({ avatar: () => data({ formError: 'That file is too large.' }, { status: 413 }) })
    pick(new File(['x'], 'big.png', { type: 'image/png' }))
    fireEvent.click(screen.getByRole('button', { name: copy.settings.avatar.upload }))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('That file is too large.'),
    )
  })
})

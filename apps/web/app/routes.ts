import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('register', 'routes/register.tsx'),
  route('logout', 'routes/logout.tsx'),
  route('verify-email', 'routes/verify-email.tsx'),
  route('resend-verification', 'routes/resend-verification.tsx'),
  route('notifications/read', 'routes/notifications-read.tsx'),
  route('forgot-password', 'routes/forgot-password.tsx'),
  route('reset-password', 'routes/reset-password.tsx'),
  route('confirm-email-change', 'routes/confirm-email-change.tsx'),
  route('settings/avatar', 'routes/settings-avatar.tsx'),
  route('settings', 'routes/settings.tsx', [
    index('routes/settings-index.tsx'),
    route('profile', 'routes/settings-profile.tsx'),
    route('security', 'routes/settings-security.tsx'),
  ]),
] satisfies RouteConfig

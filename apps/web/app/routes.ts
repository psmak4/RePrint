import { index, type RouteConfig, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('register', 'routes/register.tsx'),
  route('logout', 'routes/logout.tsx'),
  route('verify-email', 'routes/verify-email.tsx'),
  route('resend-verification', 'routes/resend-verification.tsx'),
  route('forgot-password', 'routes/forgot-password.tsx'),
  route('reset-password', 'routes/reset-password.tsx'),
] satisfies RouteConfig

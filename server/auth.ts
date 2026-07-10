import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { anonymous } from 'better-auth/plugins'
import { prisma } from './prisma'
import { env } from './env'

// When launched via `portless` the app is served from a named HTTPS origin
// (e.g. https://swg.localhost) on a random port. The proxy injects PORTLESS_URL —
// prefer it so better-auth issues cookies for and trusts that origin. Without
// portless this is undefined and we fall back to BETTER_AUTH_URL (localhost:3000).
const portlessUrl = process.env.PORTLESS_URL

export const auth = betterAuth({
  baseURL: portlessUrl ?? env.BETTER_AUTH_URL,
  trustedOrigins: portlessUrl ? [portlessUrl] : undefined,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  // guests drop into the war with zero friction; they can link an email later
  plugins: [anonymous()],
})

export type Session = typeof auth.$Infer.Session

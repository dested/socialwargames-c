import { readFileSync } from 'node:fs'
import { Client } from 'pg'

// Wipe the test database before the suite so sign-up uses a fresh fixed user
// and screenshots are byte-for-byte reproducible. Runs once per `playwright test`.
export default async function globalSetup() {
  let fallback = 'postgres://postgres:postgres@localhost:5432/social_war_games_test'
  try {
    // same .env derivation as playwright.config.ts
    const url = /DATABASE_URL="?([^"\r\n]+)"?/.exec(readFileSync('.env', 'utf8'))?.[1]
    if (url) fallback = url.replace(/\/[^/]*$/, '/social_war_games_test')
  } catch {
    // no .env — CI provides E2E_DATABASE_URL
  }
  const connectionString = process.env.E2E_DATABASE_URL ?? fallback
  const client = new Client({ connectionString })
  await client.connect()
  // "game" cascades to round/vote/rally/game_player/player_stat; "user" to the rest.
  await client.query(
    'TRUNCATE TABLE "post", "session", "account", "verification", "game", "user" RESTART IDENTITY CASCADE'
  )
  await client.end()
}

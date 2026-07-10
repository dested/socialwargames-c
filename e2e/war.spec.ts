import { expect, test } from '@playwright/test'

// The core loop: a guest drops in, taps their capital, casts a production
// vote, and the war room shows the war. Uses the dev-only window.__war handle
// to compute exact canvas coordinates for the capital cell.

declare global {
  interface Window {
    __war?: {
      renderer: { cellToScreen: (q: number, r: number, w: number, h: number) => { x: number; y: number } }
      latest: { snapshot: { units: { id: number; type: string; faction: number; q: number; r: number }[] } | null }
      myFaction: number
    }
  }
}

test('guest joins the blitz war, votes on the capital, war room updates', async ({ page }) => {
  await page.goto('/play/blitz')

  // guest auto-join completed → energy pill renders
  await expect(page.getByText(/⚡ \d+\/25/)).toBeVisible({ timeout: 20000 })

  await page.waitForFunction(
    () => !!window.__war?.renderer && !!window.__war.latest.snapshot && window.__war.myFaction >= 0,
  )
  const pos = await page.evaluate(() => {
    const war = window.__war!
    const cap = war.latest.snapshot!.units.find((u) => u.type === 'capital' && u.faction === war.myFaction)!
    return war.renderer.cellToScreen(cap.q, cap.r, window.innerWidth, window.innerHeight)
  })
  await page.mouse.click(pos.x, pos.y)

  // bottom sheet opens on the capital
  await expect(page.getByText(/Capital №\d+/)).toBeVisible()

  // vote: produce a worker at the capital discount (fresh war → pool 20)
  await page.getByRole('button', { name: 'Worker (8)' }).click()
  await expect(page.getByText(/your vote: Produce Worker/)).toBeVisible()
  await expect(page.getByText(/⚡ 4\/25/).first()).toBeVisible()

  // the war room shows the same war
  await page.goto('/war/blitz')
  await expect(page.getByText(/Blitz War · round \d+/)).toBeVisible()
  await expect(page.getByText('Verdant Compact —', { exact: false })).toBeVisible()
})

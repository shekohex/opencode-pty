import { expect } from '@playwright/test'
import { test as extendedTest } from '../fixtures'
import type { PTYSessionInfo } from '../../../src/plugin/pty/types'

extendedTest.describe('Server Clean Start', () => {
  extendedTest('should start with empty session list via API', async ({ api }) => {
    // Clear any existing sessions first
    await api.sessions.clear()

    // Wait for sessions to actually be cleared (retry up to 5 times)
    let sessions: PTYSessionInfo[] = []
    for (let i = 0; i < 5; i++) {
      sessions = await api.sessions.list()
      if (sessions.length === 0) break
      // Wait a bit before retrying
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Should be an empty array
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBe(0)
  })

  extendedTest('should start with empty session list via browser', async ({ page, api }) => {
    // Clear any existing sessions from previous tests
    await api.sessions.clear()

    // Wait for sessions to actually be cleared in the UI (retry up to 5 times)
    for (let i = 0; i < 5; i++) {
      const sessionItems = page.locator('.session-item')
      try {
        await expect(sessionItems).toHaveCount(0, { timeout: 500 })
        break // Success, sessions are cleared
      } catch {
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }

    // Check that there are no sessions in the sidebar
    const sessionItems = page.locator('.session-item')
    await expect(sessionItems).toHaveCount(0, { timeout: 2000 })

    // Check that the "No active sessions" message appears in the sidebar
    await expect(page.getByText('No active sessions')).toBeVisible()
  })
})

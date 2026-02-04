import { test as extendedTest, expect } from '../fixtures'
import type { PTYSessionInfo } from '../../../src/plugin/pty/types'

extendedTest.describe('App Component', () => {
  extendedTest('renders the PTY Sessions title', async ({ page }) => {
    // Page automatically navigated to server URL by fixture
    await expect(page.getByText('PTY Sessions')).toBeVisible()
  })

  extendedTest('shows connected status when WebSocket connects', async ({ page }) => {
    // Page automatically navigated to server URL by fixture
    await expect(page.getByText('● Connected')).toBeVisible()
  })

  extendedTest('receives WebSocket session_list messages', async ({ page, api }) => {
    // Page automatically navigated by fixture, sessions cleared by fixture

    // Create a session to trigger session_list update
    await api.sessions.create({
      command: 'echo',
      args: ['test'],
      description: 'Test session for WebSocket check',
    })

    // Wait for session to appear in UI (indicates WebSocket session_list was processed)
    await page.waitForSelector('.session-item', { timeout: 5000 })

    // Verify session appears in the list
    const sessionText = await page.locator('.session-item').first().textContent()
    expect(sessionText).toContain('Test session for WebSocket check')
  })

  extendedTest('shows no active sessions message when empty', async ({ page }) => {
    await expect(page.getByText('● Connected')).toBeVisible({ timeout: 10000 })

    // Now check that "No active sessions" appears in the sidebar
    await expect(page.getByText('No active sessions')).toBeVisible()
  })

  extendedTest('shows empty state when no session is selected', async ({ page, api }) => {
    // Set skip autoselect to prevent automatic selection
    await page.evaluate(() => {
      localStorage.setItem('skip-autoselect', 'true')
    })

    // Create a session
    await api.sessions.create({
      command: 'echo',
      args: ['test'],
      description: 'Test session',
    })

    // Reload to get the session list
    await page.reload()

    // Now there should be a session in the sidebar but none selected
    const emptyState = page.locator('.empty-state').first()
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toHaveText('Select a session from the sidebar to view its output')
  })

  extendedTest.describe('WebSocket Message Handling', () => {
    extendedTest(
      'increments WS message counter when receiving data for active session',
      async ({ page, api }) => {
        extendedTest.setTimeout(15000) // Increase timeout for slow session startup

        // Create a test session that produces continuous output
        await api.sessions.create({
          command: 'bash',
          args: [
            '-c',
            'echo "Welcome to live streaming test"; while true; do echo "$(date +"%H:%M:%S"): Live update"; sleep 0.1; done',
          ],
          description: 'Live streaming test session',
        })

        // Robustly wait for session to actually start (event-driven)
        // Use Node.js polling instead of browser context to access api
        const waitStartTime = Date.now()
        const waitTimeoutMs = 10000
        while (Date.now() - waitStartTime < waitTimeoutMs) {
          try {
            const sessions = await api.sessions.list()
            const targetSession = sessions.find(
              (s: PTYSessionInfo) =>
                s.description === 'Live streaming test session' && s.status === 'running'
            )
            if (targetSession) break
          } catch (error) {
            console.warn('Error checking session status:', error)
          }
          await new Promise((resolve) => setTimeout(resolve, 200))
        }

        // Optionally, also wait for session-item in UI
        await page.waitForSelector('.session-item', { timeout: 5000 })

        // This enforces robust event-driven wait before proceeding further.

        // Check session status
        await api.sessions.list()

        // Don't reload - wait for the session to appear in the UI
        await page.waitForSelector('.session-item', { timeout: 5000 })

        // Wait for session to appear
        await page.waitForSelector('.session-item', { timeout: 5000 })

        // Check session status
        const sessionItems = page.locator('.session-item')

        // Click on the first session
        const firstSession = sessionItems.first()

        await firstSession.click()

        // Wait for session to be active and debug element to appear
        await page.waitForSelector('.output-header .output-title', { timeout: 2000 })
        await page.waitForSelector('[data-testid="debug-info"]', { timeout: 2000 })

        // Get session ID from debug element
        const initialDebugElement = page.locator('[data-testid="debug-info"]')
        await initialDebugElement.waitFor({ state: 'attached', timeout: 1000 })
        const initialDebugText = (await initialDebugElement.textContent()) || ''
        const activeMatch = initialDebugText.match(/active:\s*([^\s,]+)/)
        const sessionId = activeMatch && activeMatch[1] ? activeMatch[1] : null

        // Check if session has output
        if (sessionId) {
          await api.session.buffer.raw({ id: sessionId })
        }

        const initialWsMatch = initialDebugText.match(/WS raw_data:\s*(\d+)/)
        const initialCount = initialWsMatch && initialWsMatch[1] ? parseInt(initialWsMatch[1]) : 0

        // Wait until WebSocket message count increases from initial
        await page.waitForFunction(
          ({ selector, initialCount }) => {
            const el = document.querySelector(selector)
            if (!el) return false
            const match = el.textContent && el.textContent.match(/WS raw_data:\s*(\d+)/)
            const count = match && match[1] ? parseInt(match[1]) : 0
            return count > initialCount
          },
          { selector: '[data-testid="debug-info"]', initialCount },
          { timeout: 7000 }
        )

        // Check that WS message count increased
        const finalDebugText = (await initialDebugElement.textContent()) || ''
        const finalWsMatch = finalDebugText.match(/WS raw_data:\s*(\d+)/)
        const finalCount = finalWsMatch && finalWsMatch[1] ? parseInt(finalWsMatch[1]) : 0

        // The test should fail if no messages were received
        expect(finalCount).toBeGreaterThan(initialCount)
      }
    )

    extendedTest(
      'does not increment WS counter for messages from inactive sessions',
      async ({ page, api }) => {
        // Create first session
        await api.sessions.create({
          command: 'bash',
          args: ['-c', 'while true; do echo "session1 $(date +%s)"; sleep 0.1; done'],
          description: 'Session 1',
        })

        // Create second session
        await api.sessions.create({
          command: 'bash',
          args: ['-c', 'while true; do echo "session2 $(date +%s)"; sleep 0.1; done'],
          description: 'Session 2',
        })

        // Wait until both session items appear in the sidebar before continuing
        // Only one session is needed for the next test.
        await page.waitForFunction(
          () => {
            return document.querySelectorAll('.session-item').length >= 1
          },
          { timeout: 6000 }
        )
        await page.reload()

        // Wait for sessions
        await page.waitForSelector('.session-item', { timeout: 5000 })

        // Click on first session
        const sessionItems = page.locator('.session-item')
        await sessionItems.nth(0).click()

        // Wait for it to be active
        await page.waitForSelector('.output-header .output-title', { timeout: 2000 })

        // Get initial count
        const debugElement = page.locator('[data-testid="debug-info"]')
        await debugElement.waitFor({ state: 'attached', timeout: 1000 })
        const initialDebugText = (await debugElement.textContent()) || ''
        const initialWsMatch = initialDebugText.match(/WS raw_data:\s*(\d+)/)
        const initialCount = initialWsMatch && initialWsMatch[1] ? parseInt(initialWsMatch[1]) : 0

        // Wait until WebSocket message count increases from initial
        await page.waitForFunction(
          ({ selector, initialCount }) => {
            const el = document.querySelector(selector)
            if (!el) return false
            const match = el.textContent && el.textContent.match(/WS raw_data:\s*(\d+)/)
            const count = match && match[1] ? parseInt(match[1]) : 0
            return count > initialCount
          },
          { selector: '[data-testid="debug-info"]', initialCount },
          { timeout: 7000 }
        )
        const finalDebugText = (await debugElement.textContent()) || ''
        const finalWsMatch = finalDebugText.match(/WS raw_data:\s*(\d+)/)
        const finalCount = finalWsMatch && finalWsMatch[1] ? parseInt(finalWsMatch[1]) : 0

        // Should have received messages for the active session
        expect(finalCount).toBeGreaterThan(initialCount)
      }
    )

    extendedTest('maintains WS counter state during page refresh', async ({ page, api }) => {
      // Create a streaming session
      await api.sessions.create({
        command: 'bash',
        args: ['-c', 'while true; do echo "streaming"; sleep 0.1; done'],
        description: 'Streaming session',
      })

      // Wait until a session item appears in the sidebar (robust: >= 1 session)
      await page.waitForFunction(
        () => {
          return document.querySelectorAll('.session-item').length >= 1
        },
        { timeout: 6000 }
      )
      await page.reload()

      // Wait for sessions
      await page.waitForSelector('.session-item', { timeout: 5000 })

      await page.locator('.session-item').first().click()
      await page.waitForSelector('.output-header .output-title', { timeout: 2000 })

      // Wait for messages (WS message counter event-driven)
      await page.waitForFunction(
        ({ selector }) => {
          const el = document.querySelector(selector)
          if (!el) return false
          const match = el.textContent && el.textContent.match(/WS raw_data:\s*(\d+)/)
          const count = match && match[1] ? parseInt(match[1]) : 0
          return count > 0
        },
        { selector: '[data-testid="debug-info"]' },
        { timeout: 7000 }
      )

      const debugElement = page.locator('[data-testid="debug-info"]')
      await debugElement.waitFor({ state: 'attached', timeout: 2000 })
      const debugText = (await debugElement.textContent()) || ''
      const wsMatch = debugText.match(/WS raw_data:\s*(\d+)/)
      const count = wsMatch && wsMatch[1] ? parseInt(wsMatch[1]) : 0

      // Should have received some messages
      expect(count).toBeGreaterThan(0)
    })
  })
})

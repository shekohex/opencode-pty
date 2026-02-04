import { test as extendedTest, expect } from './fixtures'

extendedTest.describe('WebSocket Raw Data Counter', () => {
  extendedTest(
    'increments WS raw_data counter when typing in xterm (input echo)',
    async ({ page, api }) => {
      await page.addInitScript(() => {
        localStorage.setItem('skip-autoselect', 'true')
      })

      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create a bash session that will echo input
      await api.sessions.create({
        command: 'bash',
        args: ['-i'],
        description: 'Echo test session',
      })

      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Echo test session")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })

      // Wait for terminal to be ready
      await page.waitForSelector('.terminal.xterm', { timeout: 5000 })

      // Get initial WS counter value
      const debugElement = page.locator('[data-testid="debug-info"]')
      await debugElement.waitFor({ state: 'attached', timeout: 2000 })
      const initialDebugText = (await debugElement.textContent()) || ''
      const initialWsMatch = initialDebugText.match(/WS raw_data:\s*(\d+)/)
      const initialCount = initialWsMatch && initialWsMatch[1] ? parseInt(initialWsMatch[1]) : 0

      // Click on terminal and type some text
      await page.locator('.terminal.xterm').click()
      await page.keyboard.type('hello world')

      // Wait for the counter to increment (PTY should echo the input back)
      await page.waitForFunction(
        ({ selector, initialCount }) => {
          const el = document.querySelector(selector)
          if (!el) return false
          const match = el.textContent && el.textContent.match(/WS raw_data:\s*(\d+)/)
          const count = match && match[1] ? parseInt(match[1]) : 0
          return count > initialCount
        },
        { selector: '[data-testid="debug-info"]', initialCount },
        { timeout: 5000 }
      )

      // Verify counter incremented
      const finalDebugText = (await debugElement.textContent()) || ''
      const finalWsMatch = finalDebugText.match(/WS raw_data:\s*(\d+)/)
      const finalCount = finalWsMatch && finalWsMatch[1] ? parseInt(finalWsMatch[1]) : 0

      expect(finalCount).toBeGreaterThan(initialCount)
      // Robust: Only require an increase, do not assume 1:1 mapping with input chars
      // Optionally, check terminal for "hello world" if further end-to-end validation wanted
    }
  )
})

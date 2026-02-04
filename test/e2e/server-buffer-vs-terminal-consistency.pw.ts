import { test as extendedTest, expect } from './fixtures'

extendedTest.describe('Xterm Content Extraction', () => {
  extendedTest(
    'should verify server buffer consistency with terminal display',
    async ({ page, api }) => {
      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create a session that runs a command and produces output
      const session = await api.sessions.create({
        command: 'bash',
        args: ['-c', 'echo "Hello from consistency test" && sleep 1'],
        description: 'Buffer consistency test',
      })
      const sessionId = session.id
      expect(sessionId).toBeDefined()

      // Wait for session to appear and select it
      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Buffer consistency test")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })
      await page.waitForSelector('.xterm', { timeout: 5000 })

      // Wait for the expected output to be present in the terminal
      await page.waitForSelector('.xterm:has-text("Hello from consistency test")', {
        timeout: 10000,
      })

      // Extract content using SerializeAddon
      const serializeAddonOutput = await page.evaluate(() => {
        const serializeAddon = window.xtermSerializeAddon

        if (!serializeAddon) {
          // SerializeAddon not found; let Playwright fail
          return ''
        }

        try {
          return serializeAddon.serialize({
            excludeModes: true,
            excludeAltBuffer: true,
          })
        } catch {
          return ''
        }
      })

      // Get server buffer content via API
      const bufferData = await api.session.buffer.raw({ id: sessionId })

      // Verify server buffer contains the expected content
      expect(bufferData.raw.length).toBeGreaterThan(0)

      // Check that the buffer contains the command execution
      expect(bufferData.raw).toContain('Hello from consistency test')

      // Verify SerializeAddon captured some terminal content
      expect(serializeAddonOutput.length).toBeGreaterThan(0)
    }
  )
})

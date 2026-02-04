import { test as extendedTest, expect } from './fixtures'

extendedTest.describe('Xterm Content Extraction', () => {
  extendedTest(
    'should extract terminal content using SerializeAddon from command output',
    async ({ page, api }) => {
      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create a session that runs a command and produces output
      await api.sessions.create({
        command: 'echo',
        args: ['Hello from manual buffer test'],
        description: 'Manual buffer test',
      })

      // Wait for session to appear and select it
      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Manual buffer test")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })
      await page.waitForSelector('.xterm', { timeout: 5000 })

      // Wait for command output to appear
      await page.waitForSelector('.xterm:has-text("Hello from manual buffer test")', {
        timeout: 10000,
      })

      // Extract content directly from xterm.js Terminal buffer using manual reading
      const extractedContent = await page.evaluate(() => {
        const term = window.xtermTerminal

        if (!term?.buffer?.active) {
          return []
        }

        const buffer = term.buffer.active
        const result: string[] = []

        // Read all lines that exist in the buffer
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i)
          if (!line) continue

          // Use translateToString for proper text extraction
          let text = ''
          if (line.translateToString) {
            text = line.translateToString()
          }

          // Trim trailing whitespace
          text = text.replace(/\s+$/, '')
          if (text) result.push(text)
        }

        return result
      })

      // Verify we extracted some content
      expect(extractedContent.length).toBeGreaterThan(0)

      // Verify the expected output is present
      const fullContent = extractedContent.join('\n')
      expect(fullContent).toContain('Hello from manual buffer test')
    }
  )
})

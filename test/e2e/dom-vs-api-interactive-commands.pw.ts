import { test as extendedTest, expect } from './fixtures'
import { waitForTerminalRegex } from './xterm-test-helpers'

extendedTest.describe('Xterm Content Extraction', () => {
  extendedTest(
    'should compare DOM scraping vs Terminal API with interactive commands',
    async ({ page, api }) => {
      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create interactive bash session
      await api.sessions.create({
        command: 'bash',
        args: ['-i'],
        description: 'Interactive command comparison test',
      })

      // Wait for session to appear and select it
      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Interactive command comparison test")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })
      await page.waitForSelector('.xterm', { timeout: 5000 })

      // Wait for session to initialize
      await waitForTerminalRegex(page, /\$\s*$/)

      // Send interactive command
      await page.locator('.terminal.xterm').click()
      await page.keyboard.type('echo "Hello World"', { delay: 20 })
      await page.keyboard.press('Enter')

      // Wait for command execution
      await waitForTerminalRegex(page, /Hello World/)

      // Extract content using DOM scraping
      const domContent = await page.evaluate(() => {
        const terminalElement = document.querySelector('.xterm')
        if (!terminalElement) return []

        const lines = Array.from(terminalElement.querySelectorAll('.xterm-rows > div')).map(
          (row) => {
            return Array.from(row.querySelectorAll('span'))
              .map((span) => span.textContent || '')
              .join('')
          }
        )

        return lines
      })

      // Extract content using xterm.js Terminal API
      const terminalContent = await page.evaluate(() => {
        const term = window.xtermTerminal
        if (!term?.buffer?.active) return []

        const buffer = term.buffer.active
        const lines = []
        for (let i = 0; i < buffer.length; i++) {
          const line = buffer.getLine(i)
          if (line) {
            lines.push(line.translateToString())
          } else {
            lines.push('')
          }
        }
        return lines
      })

      // Compare lengths
      expect(domContent.length).toBe(terminalContent.length)

      // Compare content (logging removed for minimal output)

      // Verify expected content is present
      const domJoined = domContent.join('\n')
      expect(domJoined).toContain('echo "Hello World"')
      expect(domJoined).toContain('Hello World')
    }
  )
})

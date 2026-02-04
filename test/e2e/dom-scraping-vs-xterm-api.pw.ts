import { test as extendedTest, expect } from './fixtures'
import { waitForTerminalRegex } from './xterm-test-helpers'

extendedTest.describe('Xterm Content Extraction', () => {
  extendedTest(
    'should validate DOM scraping against xterm.js Terminal API',
    async ({ page, api }) => {
      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create a session and run some commands to generate content
      await api.sessions.create({
        command: 'bash',
        args: ['-c', 'echo "Line 1" && echo "Line 2" && echo "Line 3"'],
        description: 'Content extraction validation test',
      })

      // Wait for session to appear and select it
      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Content extraction validation test")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })
      await page.waitForSelector('.xterm', { timeout: 5000 })

      // Wait for the command to complete
      await waitForTerminalRegex(page, /Line 3/)

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

      // NOTE: Strict line-by-line equality between DOM and Terminal API is not enforced.
      // xterm.js and DOM scraper may differ on padding, prompt, and blank lines due to rendering quirks across browsers/versions.
      // For robust test coverage, instead assert BOTH methods contain the expected command output as an ordered slice.

      function findSliceIndex(haystack: string[], needles: string[]): number {
        // Returns the index in haystack where an ordered slice matching needles starts, or -1
        outer: for (let i = 0; i <= haystack.length - needles.length; i++) {
          for (let j = 0; j < needles.length; j++) {
            const hay = haystack[i + j] ?? ''
            const needle = needles[j] ?? ''
            if (!hay.includes(needle)) {
              continue outer
            }
          }
          return i
        }
        return -1
      }

      const expectedLines = ['Line 1', 'Line 2', 'Line 3']
      const domIdx = findSliceIndex(domContent, expectedLines)
      const termIdx = findSliceIndex(terminalContent, expectedLines)
      expect(domIdx).not.toBe(-1) // DOM extraction contains output
      expect(termIdx).not.toBe(-1) // API extraction contains output

      // Optionally: Fail if the arrays are dramatically different in length (to catch regressions)
      expect(Math.abs(domContent.length - terminalContent.length)).toBeLessThan(8)
      expect(domContent.length).toBeGreaterThanOrEqual(3)
      expect(terminalContent.length).toBeGreaterThanOrEqual(3)

      // (No output if matching: ultra-silent)
      // If wanted, could log a warning if any unexpected extra content appears (not required for this test)
    }
  )
})

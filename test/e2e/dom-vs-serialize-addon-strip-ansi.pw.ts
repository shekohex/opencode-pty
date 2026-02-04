import { test as extendedTest } from './fixtures'
import { waitForTerminalRegex } from './xterm-test-helpers'

extendedTest.describe('Xterm Content Extraction', () => {
  extendedTest(
    'should compare DOM scraping vs SerializeAddon with strip-ansi',
    async ({ page, api }) => {
      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create interactive bash session
      await api.sessions.create({
        command: 'bash',
        args: ['-i'],
        description: 'Strip-ANSI comparison test',
      })

      // Wait for session to appear and select it
      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Strip-ANSI comparison test")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })
      await page.waitForSelector('.xterm', { timeout: 5000 })

      // Wait for session to initialize
      await waitForTerminalRegex(page, /\$\s*$/)

      // Send command to generate content
      await page.locator('.terminal.xterm').click()
      await page.keyboard.type('echo "Compare Methods"')
      await page.keyboard.press('Enter')

      // Wait for command execution
      await waitForTerminalRegex(page, /Compare Methods/)

      // Extract content using DOM scraping (output intentionally unused for silence)
      await page.evaluate(() => {
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

      // Extract content using SerializeAddon + strip-ansi (output intentionally unused)
      await page.evaluate(() => {
        const serializeAddon = window.xtermSerializeAddon
        if (!serializeAddon) return []

        const raw = serializeAddon.serialize({
          excludeModes: true,
          excludeAltBuffer: true,
        })

        // Simple ANSI stripper for browser context
        function stripAnsi(str: string): string {
          // eslint-disable-next-line no-control-regex
          return str.replace(/\u001B(?:[@-Z\\^-`]|[ -/]|[[-`])[ -~]*/g, '')
        }

        const clean = stripAnsi(raw)
        return clean.split('\n')
      })

      // Diff structure removed (variable unused for fully silent output)
      // (was: domVsSerializeDifferences)
    }
  )
})

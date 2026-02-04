import { getSerializedContentByXtermSerializeAddon } from './xterm-test-helpers'
import { test as extendedTest, expect } from './fixtures'

extendedTest.describe('Xterm Content Extraction - Local vs Remote Echo (Fast Typing)', () => {
  extendedTest(
    'should demonstrate local vs remote echo behavior with fast typing',
    async ({ page, api }) => {
      await page.waitForSelector('h1:has-text("PTY Sessions")')

      // Create interactive bash session
      await api.sessions.create({
        command: 'bash',
        args: ['-i'],
        description: 'Local vs remote echo test',
      })

      // Wait for session to appear and select it
      await page.waitForSelector('.session-item', { timeout: 5000 })
      await page.locator('.session-item:has-text("Local vs remote echo test")').click()
      await page.waitForSelector('.output-container', { timeout: 5000 })
      await page.waitForSelector('.xterm', { timeout: 5000 })

      // Wait for session prompt to appear, indicating readiness
      await page.waitForSelector('.xterm:has-text("$")', { timeout: 10000 })

      // Take pre-input terminal snapshot (via SerializeAddon)
      const beforeInput = await getSerializedContentByXtermSerializeAddon(page)

      // Fast typing - no delays to trigger local echo interference
      await page.locator('.terminal.xterm').click()
      await page.keyboard.type('echo "Hello World"')
      await page.keyboard.press('Enter')

      // Wait for output to flush (look for "Hello World" on the buffer)
      // Use xterm SerializeAddon waiter for robust pattern match
      await page.waitForTimeout(200) // Give PTY process a moment to echo
      await page.waitForSelector('.xterm:has-text("Hello World")', { timeout: 4000 })

      // Take post-input terminal snapshot (via SerializeAddon)
      const afterInput = await getSerializedContentByXtermSerializeAddon(page)

      // Perform assertions: 'echo', 'Hello World' must appear in the post-input buffer
      expect(afterInput).toContain('echo')
      expect(afterInput).toContain('Hello World')

      // Optionally, assert that character diff increased by correct amount
      // (i.e. afterInput contains more non-whitespace text than beforeInput)
      const beforeText = beforeInput.replace(/\s/g, '')
      const afterText = afterInput.replace(/\s/g, '')
      expect(afterText.length).toBeGreaterThan(beforeText.length)

      // Minimal debug output on failure for signal [optional]
    }
  )
})

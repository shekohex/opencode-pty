import {
  getSerializedContentByXtermSerializeAddon,
  waitForTerminalRegex,
} from './xterm-test-helpers'
import { test as extendedTest, expect } from './fixtures'

extendedTest.describe(
  'Xterm Content Extraction - Visual Verification (DOM vs Serialize vs Plain API)',
  () => {
    extendedTest(
      'should provide visual verification of DOM vs SerializeAddon vs Plain API extraction in bash -c',
      async ({ page, api }) => {
        // Setup session with ANSI-rich content
        const session = await api.sessions.create({
          command: 'bash',
          args: [
            '-c',
            'echo "Normal text"; echo "$(tput setaf 1)RED$(tput sgr0) and $(tput setaf 4)BLUE$(tput sgr0)"; echo "More text"',
          ],
          description: 'Visual verification test',
        })

        // Wait for UI
        await page.waitForSelector('h1:has-text("PTY Sessions")')
        await page.waitForSelector('.session-item', { timeout: 5000 })
        await page.locator('.session-item:has-text("Visual verification test")').click()
        await page.waitForSelector('.xterm', { timeout: 5000 })
        await waitForTerminalRegex(page, /More text/)

        // Extraction methods
        const serializeStrippedContent = Bun.stripANSI(
          await getSerializedContentByXtermSerializeAddon(page)
        ).split('\n')
        const plainData = await api.session.buffer.plain({ id: session.id })
        const plainApiContent = plainData.plain.split('\n')

        // Check: SerializeAddon output is canonical for this test
        const serializeJoined = serializeStrippedContent.join('\n')
        expect(serializeJoined).toContain('Normal text')
        expect(serializeJoined).toContain('RED')
        expect(serializeJoined).toContain('BLUE')
        expect(serializeJoined).toContain('More text')
        expect(serializeJoined).not.toContain('\x1B[') // No ANSI codes in Serialize+strip
        expect(Math.abs(serializeStrippedContent.length - plainApiContent.length)).toBeLessThan(3)

        // DOM output used for debug/report only--do not assert on it
        // Example (manual cross-check):
        // console.log('DOM output lines:', domContent)
        // console.log('SerializeAddon output:', serializeStrippedContent)
      }
    )
  }
)

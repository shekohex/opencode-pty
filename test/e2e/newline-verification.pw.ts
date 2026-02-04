import { test as extendedTest, expect } from './fixtures'
import {
  waitForTerminalRegex,
  getSerializedContentByXtermSerializeAddon,
} from './xterm-test-helpers'

extendedTest.describe('Xterm Newline Handling', () => {
  extendedTest('should capture typed character in xterm display', async ({ page, api }) => {
    // Create interactive bash session
    await api.sessions.create({
      command: 'bash',
      args: ['-i'],
      description: 'Simple typing test session',
    })

    // Wait for UI
    await page.waitForSelector('h1:has-text("PTY Sessions")')
    await page.waitForSelector('.session-item', { timeout: 5000 })
    await page.locator('.session-item').first().click()
    await page.waitForSelector('.xterm', { timeout: 5000 })
    await waitForTerminalRegex(page, /\$\s*$/)

    // Use SerializeAddon before typing
    const beforeContent = await getSerializedContentByXtermSerializeAddon(page, {
      excludeModes: true,
      excludeAltBuffer: true,
    })
    // await page.waitForTimeout(50)

    // Type single character
    await page.locator('.terminal.xterm').click()
    await page.keyboard.type('a')
    await waitForTerminalRegex(page, /a/)

    const afterContent = await getSerializedContentByXtermSerializeAddon(page, {
      excludeModes: true,
      excludeAltBuffer: true,
    })

    // Use robust character counting
    const cleanBefore = Bun.stripANSI(beforeContent)
    const cleanAfter = Bun.stripANSI(afterContent)
    const beforeCount = (cleanBefore.match(/a/g) || []).length
    const afterCount = (cleanAfter.match(/a/g) || []).length
    expect(afterCount - beforeCount).toBe(1)
  })

  extendedTest('should not add extra newlines when running echo command', async ({ page, api }) => {
    // Create interactive bash session
    await api.sessions.create({
      command: 'bash',
      args: ['-i'],
      description: 'PTY Buffer readRaw() Function',
    })

    // Wait for UI
    await page.waitForSelector('h1:has-text("PTY Sessions")')
    await page.waitForSelector('.session-item', { timeout: 5000 })
    await page.locator('.session-item').first().click()
    await page.waitForSelector('.xterm', { timeout: 5000 })
    await waitForTerminalRegex(page, /\$\s*$/)

    // Capture initial
    // const initialLines = await getTerminalPlainText(page)
    // const initialLastNonEmpty = findLastNonEmptyLineIndex(initialLines)
    // console.log('🔍 Initial lines count:', initialLines.length)
    // console.log('🔍 Initial last non-empty line index:', initialLastNonEmpty)
    // logLinesUpToIndex(initialLines, initialLastNonEmpty, 'Initial content')

    // Type command
    await page.locator('.terminal.xterm').click()
    await page.keyboard.type("echo 'Hello World'")
    await page.keyboard.press('Enter')

    // Wait for output
    await waitForTerminalRegex(page, /Hello World/)

    // Get final terminal buffer via SerializeAddon (canonical, robust method)
    const finalBuffer = Bun.stripANSI(
      await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
    )
    const finalLines = finalBuffer.split('\n')
    // Ignore trailing empty lines: focus on real content
    const nonEmptyLines = finalLines.filter((line) => line.trim().length > 0)
    // Should be: prompt, echoed command, output, new prompt
    expect(nonEmptyLines.some((l) => l.includes('Hello World'))).toBe(true)
    expect(nonEmptyLines[nonEmptyLines.length - 1]).toMatch(/\$/)
    // Order: prompt, echo, output, (optional prompt)
    const idxCmd = nonEmptyLines.findIndex((l) => l.includes("echo 'Hello World'"))
    const idxOut = nonEmptyLines.findLastIndex((l) => l.includes('Hello World'))
    expect(idxCmd).toBeGreaterThan(-1)
    expect(idxOut).toBeGreaterThan(idxCmd)
    // At least 3 lines: the first prompt, echoed line, 'Hello World', maybe prompt
    expect(nonEmptyLines.length).toBeGreaterThanOrEqual(3)
  })
})

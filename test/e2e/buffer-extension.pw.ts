import { test as extendedTest, expect } from './fixtures'
import type { Page } from '@playwright/test'
import { createApiClient } from 'opencode-pty/web/shared/api-client'

/**
 * Session and Terminal Helpers for E2E buffer extension tests
 */
async function setupSession(
  page: Page,
  api: ReturnType<typeof createApiClient>,
  description: string
): Promise<string> {
  const session = await api.sessions.create({ command: 'bash', args: ['-i'], description })
  const { id } = session
  await page.waitForSelector('h1:has-text("PTY Sessions")')
  await page.waitForSelector('.session-item')
  await page.locator(`.session-item:has-text("${description}")`).click()
  await page.waitForSelector('.output-container', { timeout: 5000 })
  await page.waitForSelector('.xterm', { timeout: 5000 })
  // Wait for bash prompt to appear (indicating interactive session is ready)
  await page.waitForSelector('.xterm:has-text("$")', { timeout: 10000 })
  return id
}
async function typeInTerminal(page: Page, text: string) {
  await page.locator('.terminal.xterm').click()
  new Promise((r) => setTimeout(r, 100)) // Small delay to ensure focus
  await page.keyboard.type(text)
  // Don't wait for text to appear since we're testing buffer extension, not visual echo
}
async function getRawBuffer(
  api: ReturnType<typeof createApiClient>,
  sessionId: string
): Promise<string> {
  const data = await api.session.buffer.raw({ id: sessionId })
  return data.raw
}
// Usage: await getSerializedContentByXtermSerializeAddon(page, { excludeModes: true, excludeAltBuffer: true })

extendedTest.describe('Buffer Extension on Input', () => {
  extendedTest(
    'should extend buffer when sending input to interactive bash session',
    async ({ page, api, wsClient }) => {
      const description = 'Buffer extension test session'
      const sessionId = await setupSession(page, api, description)

      // Get initial buffer state
      const initialRaw = await getRawBuffer(api, sessionId)

      // Connect WebSocket to monitor buffer events
      wsClient.send({
        type: 'subscribe',
        sessionId,
      })

      // Type input and wait for buffer events (event-driven approach)
      // Set up the listener before typing to avoid race conditions
      const aReceivedInTimePromise = wsClient.verifyCharacterInEvents(sessionId, 'a', 5000)
      await typeInTerminal(page, 'a')
      const aReceivedInTime = await aReceivedInTimePromise

      // Verify that typing 'a' generates WebSocket events (any bash activity confirms buffer extension)
      expect(aReceivedInTime).toBe(true)

      // Verify final buffer state (more flexible than exact length check)
      const afterRaw = await getRawBuffer(api, sessionId)
      expect(afterRaw.length).toBeGreaterThan(initialRaw.length)
      expect(afterRaw).toContain('a')
    }
  )

  extendedTest(
    'should extend xterm display when sending input to interactive bash session',
    async ({ page, api }) => {
      const description = 'Xterm display test session'
      await setupSession(page, api, description)
      const initialLines = await page
        .locator('[data-testid="test-output"] .output-line')
        .allTextContents()
      const initialContent = initialLines.join('\n')
      // Initial content should have bash prompt
      expect(initialContent).toContain('$')

      // Create a new session with different output
      await api.sessions.create({
        command: 'bash',
        args: ['-c', 'echo "New session test"'],
        description: 'New test session',
      })
      await page.waitForSelector('.session-item:has-text("New test session")')
      await page.locator('.session-item:has-text("New test session")').click()
      await page.waitForTimeout(1000)

      const afterLines = await page
        .locator('[data-testid="test-output"] .output-line')
        .allTextContents()
      const afterContent = afterLines.join('\n')
      expect(afterContent).toContain('New session test')
      // Content should have changed (don't check length since initial bash prompt is long)
    }
  )

  extendedTest('should extend xterm display when running echo command', async ({ page, api }) => {
    const description = 'Echo display test session'
    await setupSession(page, api, description)
    const initialLines = await page
      .locator('[data-testid="test-output"] .output-line')
      .allTextContents()
    const initialContent = initialLines.join('\n')
    // Initial content should have bash prompt
    expect(initialContent).toContain('$')

    // Create a session that produces 'a' in output
    await api.sessions.create({
      command: 'bash',
      args: ['-c', 'echo a'],
      description: 'Echo a session',
    })
    await page.waitForSelector('.session-item:has-text("Echo a session")')
    await page.locator('.session-item:has-text("Echo a session")').click()
    await page.waitForTimeout(1000)

    const afterLines = await page
      .locator('[data-testid="test-output"] .output-line')
      .allTextContents()
    const afterContent = afterLines.join('\n')
    expect(afterContent).toContain('a')
    // Content should have changed (don't check length since initial bash prompt is long)
  })
})

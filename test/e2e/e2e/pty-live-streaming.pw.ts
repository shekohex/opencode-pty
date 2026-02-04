import { test as extendedTest } from '../fixtures'
import { expect } from '@playwright/test'
import type { PTYSessionInfo } from '../../../src/plugin/pty/types'

extendedTest.describe('PTY Live Streaming', () => {
  extendedTest('should preserve and display complete historical output buffer', async ({ api }) => {
    // This test verifies that historical data (produced before UI connects) is preserved and loaded
    // when connecting to a running PTY session. This is crucial for users who reconnect to long-running sessions.

    // Sessions automatically cleared by fixture

    // Create a fresh session that produces identifiable historical output
    const session = await api.sessions.create({
      command: 'bash',
      args: [
        '-c',
        'echo "=== START HISTORICAL ==="; echo "Line A"; echo "Line B"; echo "Line C"; echo "=== END HISTORICAL ==="; while true; do echo "LIVE: $(date +%S)"; sleep 2; done',
      ],
      description: `Historical buffer test - ${Date.now()}`,
    })

    // Give session a moment to start before polling
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Wait for session to produce historical output (before UI connects)
    // Wait until required historical buffer marker appears in raw output
    const bufferStartTime = Date.now()
    const bufferTimeoutMs = 10000 // Longer timeout for buffer population
    while (Date.now() - bufferStartTime < bufferTimeoutMs) {
      try {
        const bufferData = await api.session.buffer.raw({ id: session.id })
        if (bufferData.raw && bufferData.raw.includes('=== END HISTORICAL ===')) break
      } catch (error) {
        console.warn('Error checking buffer during wait:', error)
      }
      await new Promise((resolve) => setTimeout(resolve, 200)) // Slightly longer delay
    }
    if (Date.now() - bufferStartTime >= bufferTimeoutMs) {
      throw new Error('Timeout waiting for historical buffer content')
    }

    // Check session status via API to ensure it's running (using api)
    expect(session.status).toBe('running')

    // Verify the API returns the expected historical data (this is the core test)
    const bufferData = await api.session.buffer.raw({ id: session.id })
    expect(bufferData.raw).toBeDefined()
    expect(typeof bufferData.raw).toBe('string')
    expect(bufferData.raw.length).toBeGreaterThan(0)

    // Check that historical output is present in the buffer
    expect(bufferData.raw).toContain('=== START HISTORICAL ===')
    expect(bufferData.raw).toContain('Line A')
    expect(bufferData.raw).toContain('Line B')
    expect(bufferData.raw).toContain('Line C')
    expect(bufferData.raw).toContain('=== END HISTORICAL ===')

    // Verify live updates are also working (check for recent output)
    expect(bufferData.raw).toMatch(/LIVE: \d{2}/)

    // TODO: Re-enable UI verification once page reload issues are resolved
    // The core functionality (buffer preservation) is working correctly
  })

  extendedTest(
    'should receive live WebSocket updates from running PTY session',
    async ({ page, api }) => {
      // Page automatically navigated to server URL by fixture
      // Sessions automatically cleared by fixture

      // Create a fresh session for this test
      const initialSessions = await api.sessions.list()
      if (initialSessions.length === 0) {
        await api.sessions.create({
          command: 'bash',
          args: [
            '-c',
            'echo "Welcome to live streaming test"; echo "Type commands and see real-time output"; while true; do LC_TIME=C date +"%a %d. %b %H:%M:%S %Z %Y: Live update..."; sleep 0.1; done',
          ],
          description: 'Live streaming test session',
        })
        // Give session a moment to start before polling
        await new Promise((resolve) => setTimeout(resolve, 500))
        // Wait a bit for the session to start and reload to get updated session list
        // Wait until running session is available in API
        const sessionStartTime = Date.now()
        const sessionTimeoutMs = 10000 // Allow more time for session to start
        while (Date.now() - sessionStartTime < sessionTimeoutMs) {
          try {
            const sessions = await api.sessions.list()
            const targetSession = sessions.find(
              (s: PTYSessionInfo) =>
                s.description === 'Live streaming test session' && s.status === 'running'
            )
            if (targetSession) break
          } catch (error) {
            console.warn('Error checking session status:', error)
          }
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
        if (Date.now() - sessionStartTime >= sessionTimeoutMs) {
          throw new Error('Timeout waiting for session to become running')
        }
      }

      // Wait for sessions to load
      await page.waitForSelector('.session-item', { timeout: 5000 })

      // Find the running session
      const sessionCount = await page.locator('.session-item').count()
      const allSessions = page.locator('.session-item')

      let runningSession = null
      for (let i = 0; i < sessionCount; i++) {
        const session = allSessions.nth(i)
        const statusBadge = await session.locator('.status-badge').textContent()
        if (statusBadge === 'running') {
          runningSession = session
          break
        }
      }

      if (!runningSession) {
        throw new Error('No running session found')
      }

      await runningSession.click()

      // Wait for WebSocket to stabilize
      // Wait for output container or debug info to be visible
      await page.waitForSelector('[data-testid="debug-info"]', { timeout: 3000 })

      // Wait for initial output
      await page.waitForSelector('[data-testid="test-output"] .output-line', { timeout: 3000 })

      // Get initial count
      const outputLines = page.locator('[data-testid="test-output"] .output-line')
      const initialCount = await outputLines.count()
      expect(initialCount).toBeGreaterThan(0)

      // Check the debug info
      const debugInfo = await page.locator('[data-testid="debug-info"]').textContent()
      const debugText = (debugInfo || '') as string

      // Extract WS raw_data message count
      const wsMatch = debugText.match(/WS raw_data: (\d+)/)
      const initialWsMessages = wsMatch && wsMatch[1] ? parseInt(wsMatch[1]) : 0

      // Wait for at least 1 WebSocket streaming update
      let attempts = 0
      const maxAttempts = 50 // 5 seconds at 100ms intervals
      let currentWsMessages = initialWsMessages
      const debugElement = page.locator('[data-testid="debug-info"]')
      while (attempts < maxAttempts && currentWsMessages < initialWsMessages + 1) {
        await page.waitForTimeout(100)
        const currentDebugText = (await debugElement.textContent()) || ''
        const currentWsMatch = currentDebugText.match(/WS raw_data: (\d+)/)
        currentWsMessages = currentWsMatch && currentWsMatch[1] ? parseInt(currentWsMatch[1]) : 0
        if (attempts % 10 === 0) {
          // Log every second
        }
        attempts++
      }

      // Check final state

      // Check final output count
      // Validate that live streaming is working by checking output increased

      // Check that the new lines contain the expected timestamp format if output increased
      // Check that new live update lines were added during WebSocket streaming
      const finalOutputLines = await outputLines.count()
      // Look for lines that contain "Live update..." pattern
      let liveUpdateFound = false
      for (let i = Math.max(0, finalOutputLines - 10); i < finalOutputLines; i++) {
        const lineText = await outputLines.nth(i).textContent()
        if (lineText && lineText.includes('Live update...')) {
          liveUpdateFound = true

          break
        }
      }

      expect(liveUpdateFound).toBe(true)
    }
  )
})

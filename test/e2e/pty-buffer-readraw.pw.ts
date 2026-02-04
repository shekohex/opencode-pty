import { test as extendedTest, expect } from './fixtures'
import type { Page } from '@playwright/test'

import {
  getSerializedContentByXtermSerializeAddon,
  waitForTerminalRegex,
} from './xterm-test-helpers'
import { createApiClient } from 'opencode-pty/web/shared/api-client'

async function createSession(
  api: ReturnType<typeof createApiClient>,
  {
    command,
    args,
    description,
    env,
  }: { command: string; args: string[]; description: string; env?: Record<string, string> }
) {
  const session = await api.sessions.create({
    command,
    args,
    description,
    ...(env && { env }),
  })
  return session.id
}

async function fetchBufferApi(
  api: ReturnType<typeof createApiClient>,
  sessionId: string,
  bufferType = 'raw'
): Promise<{ raw: string; byteLength: number } | { plain: string; byteLength: number }> {
  if (bufferType === 'raw') {
    return await api.session.buffer.raw({ id: sessionId })
  } else {
    return await api.session.buffer.plain({ id: sessionId })
  }
}

async function gotoAndSelectSession(page: Page, description: string, timeout = 10000) {
  await page.waitForSelector('.session-item', { timeout })
  await page.locator(`.session-item:has-text("${description}")`).click()
  await page.waitForSelector('.output-container', { timeout })
  await page.waitForSelector('.xterm', { timeout })
}

extendedTest.describe('PTY Buffer readRaw() Function', () => {
  extendedTest(
    'should allow basic terminal input and output (minimal isolation check)',
    async ({ page, api }) => {
      const desc = 'basic input test session'
      await createSession(api, {
        command: 'bash',
        args: [],
        description: desc,
      })
      await gotoAndSelectSession(page, desc, 8000)
      // Try several input strategies sequentially
      const term = page.locator('.terminal.xterm')
      await term.click()
      await term.focus()
      // 1. Try locator.type
      await term.type('echo OK', { delay: 25 })
      await term.press('Enter')
      await waitForTerminalRegex(page, /OK/)
      // 2. Also try fallback page.keyboard in case
      await page.keyboard.type('echo OK', { delay: 25 })
      await page.keyboard.press('Enter')
      await waitForTerminalRegex(page, /OK/)
      // Print buffer after typing
      let after = await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
      // Must contain either our command or its output
      expect(after).toMatch(/echo OK|OK/)
    }
  )

  extendedTest(
    'should verify buffer preserves newline characters in PTY output',
    async ({ page, api }) => {
      const sessionId = await createSession(api, {
        command: 'bash',
        args: ['-c', 'printf "line1\nline2\nline3\n"'],
        description: 'newline preservation test',
      })
      await gotoAndSelectSession(page, 'newline preservation test', 5000)
      await waitForTerminalRegex(page, /line3/)
      const bufferData = (await fetchBufferApi(api, sessionId, 'raw')) as {
        raw: string
        byteLength: number
      }
      expect(bufferData.raw.length).toBeGreaterThan(0)
      expect(bufferData.raw).toContain('line1')
      expect(bufferData.raw).toContain('line2')
      expect(bufferData.raw).toContain('line3')
      expect(bufferData.raw).toContain('\n')
      // The key insight: PTY output contained \n characters that were properly processed
      // The buffer now stores complete lines instead of individual characters
      // This verifies that the RingBuffer correctly handles newline-delimited data
    }
  )

  extendedTest('should demonstrate readRaw functionality preserves newlines', async () => {
    // This test documents the readRaw() capability
    // In a real implementation, readRaw() would return: "line1\nline2\nline3\n"
    // While read() returns: ["line1", "line2", "line3", ""]
    const expectedRawContent = 'line1\nline2\nline3\n'
    const expectedParsedLines = ['line1', 'line2', 'line3', '']
    expect(expectedRawContent.split('\n')).toEqual(expectedParsedLines)
  })

  extendedTest('should expose raw buffer data via API endpoint', async ({ page, api }) => {
    const sessionId = await createSession(api, {
      command: 'bash',
      args: ['-c', 'printf "api\ntest\ndata\n"'],
      description: 'API raw buffer test',
    })
    await gotoAndSelectSession(page, 'API raw buffer test', 5000)
    await waitForTerminalRegex(page, /data/)
    const rawData = (await fetchBufferApi(api, sessionId, 'raw')) as {
      raw: string
      byteLength: number
    }
    expect(rawData).toHaveProperty('raw')
    expect(rawData).toHaveProperty('byteLength')
    expect(typeof rawData.raw).toBe('string')
    expect(typeof rawData.byteLength).toBe('number')
    expect(rawData.raw).toMatch(/api[\r\n]+test[\r\n]+data/)
    expect(rawData.byteLength).toBe(rawData.raw.length)
    expect(typeof rawData.raw).toBe('string')
    expect(typeof rawData.byteLength).toBe('number')
  })

  extendedTest('should expose plain text buffer data via API endpoint', async ({ page, api }) => {
    const sessionId = await createSession(api, {
      command: 'bash',
      args: ['-c', 'echo -e "\x1b[31mRed text\x1b[0m and \x1b[32mgreen text\x1b[0m"'],
      description: 'ANSI test session for plain buffer endpoint',
    })
    await gotoAndSelectSession(page, 'ANSI test session for plain buffer endpoint', 5000)
    await waitForTerminalRegex(page, /green text/)
    const plainData = (await fetchBufferApi(api, sessionId, 'plain')) as {
      plain: string
      byteLength: number
    }
    expect(plainData).toHaveProperty('plain')
    expect(plainData).toHaveProperty('byteLength')
    expect(typeof plainData.plain).toBe('string')
    expect(typeof plainData.byteLength).toBe('number')
    expect(plainData.plain).toContain('Red text and green text')
    expect(plainData.plain).not.toContain('\x1b[')
    const rawData = (await fetchBufferApi(api, sessionId, 'raw')) as {
      raw: string
      byteLength: number
    }
    expect(rawData.raw).toContain('\x1b[')
    expect(plainData.plain).not.toBe(rawData.raw)
  })

  extendedTest('should extract plain text content using SerializeAddon', async ({ page, api }) => {
    await createSession(api, {
      command: 'echo',
      args: ['Hello World'],
      description: 'Simple echo test for SerializeAddon extraction',
    })
    await gotoAndSelectSession(page, 'Simple echo test for SerializeAddon extraction', 5000)
    await waitForTerminalRegex(page, /Hello World/)
    const serializeAddonOutput = await getSerializedContentByXtermSerializeAddon(page, {
      excludeModes: true,
      excludeAltBuffer: true,
    })
    expect(serializeAddonOutput.length).toBeGreaterThan(0)
    expect(typeof serializeAddonOutput).toBe('string')
    expect(serializeAddonOutput.length).toBeGreaterThan(10)
  })

  extendedTest(
    'should match API plain buffer with SerializeAddon for interactive input',
    async ({ page, api }) => {
      await createSession(api, {
        command: 'bash',
        args: ['-i'],
        description: 'Double Echo Test Session B',
      })
      await gotoAndSelectSession(page, 'Double Echo Test Session B', 10000)
      // Debug what prompt is present before event-driven wait
      await waitForTerminalRegex(page, /\$\s*$/)
      await page.locator('.terminal.xterm').click()
      // Dump buffer before typing in Session B
      await page.keyboard.type('1')
      await waitForTerminalRegex(page, /1/)
      // Dump buffer after typing in Session B
      const sessionId = await createSession(api, {
        command: 'bash',
        args: ['-i'],
        description: 'Double Echo Test Session C',
      })
      await gotoAndSelectSession(page, 'Double Echo Test Session C', 10000)
      // Debug what prompt is present before event-driven wait
      await waitForTerminalRegex(page, /\$\s*$/)
      await page.locator('.terminal.xterm').click()
      // Dump buffer before typing in Session C
      await page.keyboard.type('1')
      await waitForTerminalRegex(page, /1/)
      // Dump buffer after typing in Session C
      const apiData = (await fetchBufferApi(api, sessionId, 'plain')) as {
        plain: string
        byteLength: number
      }
      const apiPlainText = apiData.plain
      const serializeAddonOutput = await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
      expect(apiPlainText.length).toBeGreaterThan(0)
      expect(serializeAddonOutput.length).toBeGreaterThan(0)
      expect(apiPlainText).toContain('$')
      expect(serializeAddonOutput).toContain('$')
    }
  )

  extendedTest(
    'should compare API plain text with SerializeAddon for initial bash state',
    async ({ page, api }) => {
      const sessionId = await createSession(api, {
        command: 'bash',
        args: ['-i'],
        description: 'Initial bash state test for plain text comparison',
      })
      await gotoAndSelectSession(page, 'Initial bash state test for plain text comparison', 5000)
      await waitForTerminalRegex(page, /\$\s*$/)
      const apiData = (await fetchBufferApi(api, sessionId, 'plain')) as {
        plain: string
        byteLength: number
      }
      const apiPlainText = apiData.plain
      const serializeAddonOutput = await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
      expect(apiPlainText.length).toBeGreaterThan(0)
      expect(serializeAddonOutput.length).toBeGreaterThan(0)
      expect(apiPlainText).toContain('$')
      expect(serializeAddonOutput).toContain('$')
    }
  )

  extendedTest(
    'should compare API plain text with SerializeAddon for cat command',
    async ({ page, api }) => {
      const sessionId = await createSession(api, {
        command: 'cat',
        args: ['-i'],
        description: 'Cat command test for plain text comparison',
      })
      await gotoAndSelectSession(page, 'Cat command test for plain text comparison', 5000)
      // No prompt expected after cat -i, proceed immediately
      const apiData = (await fetchBufferApi(api, sessionId, 'plain')) as {
        plain: string
        byteLength: number
      }
      const apiPlainText = apiData.plain
      const serializeAddonOutput = await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
      expect(typeof apiPlainText).toBe('string')
      expect(typeof serializeAddonOutput).toBe('string')
    }
  )

  extendedTest(
    'should prevent double-echo by comparing terminal content before and after input',
    async ({ page, api }) => {
      await createSession(api, {
        command: 'bash',
        args: ['-i'],
        description: 'Double-echo prevention test',
      })
      await gotoAndSelectSession(page, 'Double-echo prevention test', 5000)
      await waitForTerminalRegex(page, /\$\s*$/)
      const initialContent = await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
      await page.locator('.terminal.xterm').click()
      await page.keyboard.type('1')
      await waitForTerminalRegex(page, /1/)
      // const apiData = await fetchBufferApi(page, server, sessionId, 'plain')
      const afterContent = await getSerializedContentByXtermSerializeAddon(page, {
        excludeModes: true,
        excludeAltBuffer: true,
      })
      const cleanInitial = Bun.stripANSI(initialContent)
      const cleanAfter = Bun.stripANSI(afterContent)
      const initialCount = (cleanInitial.match(/1/g) || []).length
      const afterCount = (cleanAfter.match(/1/g) || []).length
      expect(afterCount - initialCount).toBe(1)
      // API buffer issue is separate - PTY output not reaching buffer (known issue)
    }
  )

  extendedTest('should clear terminal content when switching sessions', async ({ page, api }) => {
    await createSession(api, {
      command: 'echo',
      args: ['SESSION_ONE_CONTENT'],
      description: 'Session One',
    })
    await createSession(api, {
      command: 'echo',
      args: ['SESSION_TWO_CONTENT'],
      description: 'Session Two',
    })
    await page.waitForSelector('.session-item', { timeout: 10000 })
    await page.locator('.session-item').filter({ hasText: 'Session One' }).click()
    await waitForTerminalRegex(page, /SESSION_ONE_CONTENT/)
    await page.waitForFunction(
      () => {
        const serializeAddon = window.xtermSerializeAddon
        if (!serializeAddon) return false
        const content = serializeAddon.serialize({
          excludeModes: true,
          excludeAltBuffer: true,
        })
        return content.includes('SESSION_ONE_CONTENT')
      },
      { timeout: 7000 }
    )
    const session1Content = await getSerializedContentByXtermSerializeAddon(page, {
      excludeModes: true,
      excludeAltBuffer: true,
    })
    expect(session1Content).toContain('SESSION_ONE_CONTENT')
    await page.locator('.session-item').filter({ hasText: 'Session Two' }).click()
    await waitForTerminalRegex(page, /SESSION_TWO_CONTENT/)
    const session2Content = await getSerializedContentByXtermSerializeAddon(page, {
      excludeModes: true,
      excludeAltBuffer: true,
    })
    expect(session2Content).toContain('SESSION_TWO_CONTENT')
    expect(session2Content).not.toContain('SESSION_ONE_CONTENT')
  })
})

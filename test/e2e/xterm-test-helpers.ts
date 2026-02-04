import type { Page } from '@playwright/test'
import type { SerializeAddon } from '@xterm/addon-serialize'

// Global module augmentation for E2E testing
declare global {
  interface Window {
    xtermTerminal?: import('@xterm/xterm').Terminal
    xtermSerializeAddon?: SerializeAddon
  }
}

/**
 * Deprecated: Use getSerializedContentByXtermSerializeAddon for all terminal content extraction in E2E tests.
 * This DOM scraping method should only be used for rare visual/manual cross-checks or debugging.
 */
export const getTerminalPlainText = async (page: Page): Promise<string[]> => {
  return await page.evaluate(() => {
    const getPlainText = () => {
      const terminalElement = document.querySelector('.xterm')
      if (!terminalElement) return []

      const lines = Array.from(terminalElement.querySelectorAll('.xterm-rows > div')).map((row) => {
        return Array.from(row.querySelectorAll('span'))
          .map((span) => span.textContent || '')
          .join('')
      })

      // Return only lines up to the last non-empty line
      const findLastNonEmptyIndex = (lines: string[]): number => {
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i] !== '') {
            return i
          }
        }
        return -1
      }

      const lastNonEmptyIndex = findLastNonEmptyIndex(lines)
      if (lastNonEmptyIndex === -1) return []

      return lines.slice(0, lastNonEmptyIndex + 1)
    }

    return getPlainText()
  })
}

export const getSerializedContentByXtermSerializeAddon = async (
  page: Page,
  { excludeModes = false, excludeAltBuffer = false } = {}
): Promise<string> => {
  return await page.evaluate(
    (opts) => {
      const serializeAddon = window.xtermSerializeAddon
      if (!serializeAddon) return ''
      return serializeAddon.serialize({
        excludeModes: opts.excludeModes,
        excludeAltBuffer: opts.excludeAltBuffer,
      })
    },
    { excludeModes, excludeAltBuffer }
  )
}

/**
 * Robust, DRY event-driven terminal content waiter for Playwright E2E
 * Waits for regex pattern to appear in xterm.js SerializeAddon buffer.
 * Throws an error if SerializeAddon or Terminal is not available.
 * Usage: await waitForTerminalRegex(page, /pattern/)
 */
export const waitForTerminalRegex = async (
  page: Page,
  regex: RegExp,
  serializeOptions: { excludeModes?: boolean; excludeAltBuffer?: boolean } = {
    excludeModes: true,
    excludeAltBuffer: true,
  },
  timeout: number = 5000
): Promise<void> => {
  // First, ensure the serialize addon is available (with a reasonable timeout)
  await page.waitForFunction(() => window.xtermSerializeAddon !== undefined, { timeout: 10000 })

  let timeoutId: NodeJS.Timeout | undefined
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timeout waiting for terminal regex')), timeout)
  })

  const evaluatePromise = page.evaluate(
    (args) => {
      const { pattern, excludeModes, excludeAltBuffer } = args
      const term = window.xtermTerminal
      const serializeAddon = window.xtermSerializeAddon

      if (!serializeAddon) {
        throw new Error('SerializeAddon not available on window')
      }

      if (!term) {
        throw new Error('Terminal not found on window')
      }

      // Browser-compatible stripAnsi implementation
      function stripAnsi(str: string): string {
        return str.replace(
          // eslint-disable-next-line no-control-regex
          /[\u001B\u009B][[()#;?]*(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~])/g,
          ''
        )
      }

      function checkMatch(serializeAddon: SerializeAddon): boolean {
        const content = serializeAddon.serialize({
          excludeModes,
          excludeAltBuffer,
        })
        try {
          const plain = stripAnsi(content.replaceAll('\r', ''))
          return new RegExp(pattern).test(plain)
        } catch {
          return false
        }
      }

      return new Promise<boolean>((resolve) => {
        const disposable = term.onWriteParsed(() => {
          if (checkMatch(serializeAddon)) {
            disposable.dispose()
            resolve(true)
          }
        })

        // Immediate check
        if (checkMatch(serializeAddon)) {
          disposable.dispose()
          resolve(true)
        }
      })
    },
    {
      pattern: regex.source,
      excludeModes: serializeOptions.excludeModes,
      excludeAltBuffer: serializeOptions.excludeAltBuffer,
    }
  )

  try {
    await Promise.race([evaluatePromise, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

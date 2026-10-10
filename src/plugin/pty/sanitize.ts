import { stripVTControlCharacters } from 'node:util'

// String-type sequences: OSC (ESC ]), DCS (ESC P), SOS (ESC X), PM (ESC ^) and
// APC (ESC _), plus their C1 forms, up to BEL or ST (or the end of the line).
// `stripVTControlCharacters` only knows a restricted OSC payload alphabet and
// leaves e.g. Windows window titles (`ESC]0;C:\Program Files\...BEL`) behind.
const STRING_SEQUENCES =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal control sequences is the point
  /(?:\u001B[\]PX^_]|[\u0090\u0098\u009D-\u009F])[\s\S]*?(?:\u0007|\u001B\\|\u009C|$)/g

// C0 controls except \t and \n, DEL, and C1 controls. Whatever survives the
// passes above (a lone ESC, \r, BEL, BS, ...) is still written to the terminal
// verbatim by hosts that render this text.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g

// Non-global twin of CONTROL_CHARACTERS for the fast path; every sequence the
// passes below remove starts with one of these characters.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const HAS_CONTROL_CHARACTER = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/

/**
 * Whether text handed to the host (`pty_read` results and `<pty_exited>`
 * notifications) is stripped of terminal control sequences.
 *
 * Enabled by default; set `PTY_SANITIZE_OUTPUT=0` (or `false`) to receive the
 * raw terminal output instead.
 */
export function isOutputSanitizationEnabled(): boolean {
  const value = process.env.PTY_SANITIZE_OUTPUT?.trim().toLowerCase()
  return value !== '0' && value !== 'false'
}

/**
 * Removes terminal control sequences (CSI, OSC, ...) and remaining control
 * characters from a single line of PTY output, keeping tabs, and drops
 * trailing whitespace (ConPTY pads erased lines with spaces up to the terminal
 * width).
 *
 * Only applied where output leaves the plugin as text; the raw buffer is kept
 * intact for the Web UI terminal.
 */
export function sanitizeTerminalText(text: string): string {
  if (!HAS_CONTROL_CHARACTER.test(text)) {
    return text.trimEnd()
  }
  return stripVTControlCharacters(text.replace(STRING_SEQUENCES, ''))
    .replace(CONTROL_CHARACTERS, '')
    .trimEnd()
}

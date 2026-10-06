import React from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import '@xterm/xterm/css/xterm.css'

// Global module augmentation to extend Window interface
declare global {
  interface Window {
    xtermTerminal?: Terminal
    xtermSerializeAddon?: SerializeAddon
  }
}

interface RawTerminalProps {
  onSendInput?: (data: string) => void
  onInterrupt?: () => void
  disabled?: boolean
}

export class RawTerminal extends React.Component<RawTerminalProps> {
  private terminalRef = React.createRef<HTMLDivElement>()
  private xtermInstance: Terminal | null = null
  private fitAddon: FitAddon | null = null
  private serializeAddon: SerializeAddon | null = null

  override componentDidMount() {
    this.initializeTerminal()
  }

  // In band (RIS): Terminal.reset() keeps queued writes and any half-parsed escape sequence.
  reset(snapshot: string): void {
    this.write(`\x1bc${snapshot}`)
  }

  write(chunk: string): void {
    this.xtermInstance?.write(chunk)
  }

  override componentWillUnmount() {
    if (this.xtermInstance) {
      this.xtermInstance.dispose()
    }
  }

  private initializeTerminal() {
    const term = new Terminal({
      cursorBlink: true,
      theme: { background: '#1e1e1e', foreground: '#d4d4d4' },
      fontFamily: 'monospace',
      fontSize: 14,
      scrollback: 5000,
      convertEol: true,
      allowTransparency: true,
    })

    this.fitAddon = new FitAddon()
    this.serializeAddon = new SerializeAddon()
    term.loadAddon(this.fitAddon)
    term.loadAddon(this.serializeAddon)

    if (this.terminalRef.current) {
      term.open(this.terminalRef.current)
      this.fitAddon.fit()
    }

    this.xtermInstance = term

    // CRITICAL: Expose terminal and serialize addon for E2E testing
    window.xtermTerminal = term
    window.xtermSerializeAddon = this.serializeAddon

    // Set up input handling
    this.setupInputHandling(term)
  }

  private setupInputHandling(term: Terminal) {
    const { onSendInput, onInterrupt, disabled } = this.props

    if (disabled) return

    const handleData = (data: string) => {
      if (data === '\u0003') {
        // Ctrl+C
        onInterrupt?.()
      } else {
        // Send input to PTY server (PTY will echo back for interactive sessions)
        onSendInput?.(data)
      }
    }

    term.onData(handleData)
  }

  override render() {
    return (
      <div ref={this.terminalRef} className="xterm" style={{ width: '100%', height: '100%' }} />
    )
  }
}

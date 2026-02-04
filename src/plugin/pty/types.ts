import type { IPty } from 'bun-pty'
import type { RingBuffer } from './buffer.ts'
import type moment from 'moment'

export type PTYStatus = 'running' | 'exited' | 'killing' | 'killed'

export interface PTYSession {
  id: string
  title: string
  description?: string
  command: string
  args: string[]
  workdir: string
  env?: Record<string, string>
  status: PTYStatus
  exitCode?: number
  exitSignal?: number | string
  pid: number
  createdAt: moment.Moment
  parentSessionId: string
  notifyOnExit: boolean
  buffer: RingBuffer
  process: IPty | null
}

export interface PTYSessionInfo {
  id: string
  title: string
  description?: string
  command: string
  args: string[]
  workdir: string
  status: PTYStatus
  exitCode?: number
  exitSignal?: number | string
  pid: number
  createdAt: string
  lineCount: number
}

export interface SpawnOptions {
  command: string
  args?: string[]
  workdir?: string
  env?: Record<string, string>
  title?: string
  description?: string
  parentSessionId: string
  notifyOnExit?: boolean
}

export interface ReadResult {
  lines: string[]
  totalLines: number
  offset: number
  hasMore: boolean
}

export interface SearchResult {
  matches: Array<{ lineNumber: number; text: string }>
  totalMatches: number
  totalLines: number
  offset: number
  hasMore: boolean
}

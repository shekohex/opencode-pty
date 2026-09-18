import { ptyKill } from '../plugin/pty/tools/kill.ts'
import { ptyList } from '../plugin/pty/tools/list.ts'
import { ptyRead } from '../plugin/pty/tools/read.ts'
import { ptySpawn } from '../plugin/pty/tools/spawn.ts'
import { ptyWrite } from '../plugin/pty/tools/write.ts'

export const ptyTools = {
  pty_spawn: ptySpawn,
  pty_write: ptyWrite,
  pty_read: ptyRead,
  pty_list: ptyList,
  pty_kill: ptyKill,
} as const

export type PTYToolName = keyof typeof ptyTools

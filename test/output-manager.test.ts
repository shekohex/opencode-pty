import { expect, it } from 'bun:test'
import { RingBuffer } from '../src/plugin/pty/buffer.ts'
import { OutputManager } from '../src/plugin/pty/output-manager.ts'
import type { PTYSession } from '../src/plugin/pty/types.ts'

it('clamps negative read offsets before reporting pagination', () => {
  const buffer = new RingBuffer()
  buffer.append('line\n'.repeat(10))
  const result = new OutputManager().read({ buffer } as PTYSession, -40)

  expect(result.lines).toHaveLength(10)
  expect({ offset: result.offset, hasMore: result.hasMore }).toEqual({
    offset: 0,
    hasMore: false,
  })
})

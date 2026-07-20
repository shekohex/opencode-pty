import { describe, expect, it, mock } from 'bun:test'
import type { OpencodeClient } from '@opencode-ai/sdk'
import { RingBuffer } from '../src/plugin/pty/buffer.ts'
import { NotificationManager } from '../src/plugin/pty/notification-manager.ts'
import type { PTYSession } from '../src/plugin/pty/types.ts'

type PromptPayload = {
  path: { id: string }
  body: {
    parts: Array<{ type: string; text: string }>
    agent?: string
    model?: { providerID: string; modelID: string }
    variant?: string
  }
}

function createSession(overrides: Partial<PTYSession> = {}): PTYSession {
  const buffer = new RingBuffer()
  buffer.append('line 1\nline 2\n')

  return {
    id: 'pty_test',
    title: 'Test Session',
    description: 'Test session description',
    command: 'echo',
    args: ['hello'],
    workdir: '/tmp',
    status: 'running',
    pid: 12345,
    createdAt: new Date(),
    parentSessionId: 'parent-session-id',
    parentAgent: 'agent-two',
    notifyOnExit: true,
    timeoutSeconds: undefined,
    timedOut: false,
    buffer,
    process: null,
    ...overrides,
  }
}

describe('NotificationManager', () => {
  it('preserves the parent session model and variant', async () => {
    const get = mock(async () => ({
      data: {
        model: { providerID: 'openai', id: 'gpt-5.6-terra', variant: 'high' },
      },
    }))
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { get, promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession(), 0)

    expect(get).toHaveBeenCalledWith({ path: { id: 'parent-session-id' } })
    const payload = promptAsync.mock.calls[0]?.[0]
    if (!payload) throw new Error('Expected a prompt payload')
    expect(payload.body.model).toEqual({
      providerID: 'openai',
      modelID: 'gpt-5.6-terra',
    })
    expect(payload.body.variant).toBe('high')
  })

  it('preserves the parent model without inventing a variant', async () => {
    const get = mock(async () => ({
      data: { model: { providerID: 'openai', id: 'gpt-5.6-terra' } },
    }))
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { get, promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession(), 0)

    const payload = promptAsync.mock.calls[0]?.[0]
    if (!payload) throw new Error('Expected a prompt payload')
    expect(payload.body.model).toEqual({
      providerID: 'openai',
      modelID: 'gpt-5.6-terra',
    })
    expect(Object.hasOwn(payload.body, 'variant')).toBe(false)
  })

  it('sends the notification when reading the parent model fails', async () => {
    const get = mock(async () => {
      throw new Error('Session API unavailable')
    })
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { get, promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession(), 0)

    expect(promptAsync).toHaveBeenCalledTimes(1)
    const payload = promptAsync.mock.calls[0]?.[0]
    if (!payload) throw new Error('Expected a prompt payload')
    expect(Object.hasOwn(payload.body, 'model')).toBe(false)
    expect(Object.hasOwn(payload.body, 'variant')).toBe(false)
  })

  it('includes body.agent when originating agent is present', async () => {
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession({ parentAgent: 'agent-two' }), 0)

    expect(promptAsync).toHaveBeenCalledTimes(1)
    const payload = promptAsync.mock.calls[0]?.[0]
    if (!payload) throw new Error('Expected a prompt payload')

    expect(payload.path).toEqual({ id: 'parent-session-id' })
    expect(payload.body.agent).toBe('agent-two')
    expect(payload.body.parts).toHaveLength(1)
    expect(payload.body.parts[0]?.text).toContain('<pty_exited>')
    expect(payload.body.parts[0]?.text).toContain('Use pty_read to check the full output.')
  })

  it('omits body.agent when originating agent is missing', async () => {
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession({ parentAgent: undefined }), 1)

    expect(promptAsync).toHaveBeenCalledTimes(1)
    const payload = promptAsync.mock.calls[0]?.[0]
    if (!payload) throw new Error('Expected a prompt payload')

    expect(payload.path).toEqual({ id: 'parent-session-id' })
    expect(Object.hasOwn(payload.body, 'agent')).toBe(false)
    expect(payload.body.parts).toHaveLength(1)
    expect(payload.body.parts[0]?.text).toContain('<pty_exited>')
    expect(payload.body.parts[0]?.text).toContain(
      'Process failed. Use pty_read with the pattern parameter to search for errors in the output.'
    )
  })

  it('includes timeout context when the session timed out', async () => {
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession({ timeoutSeconds: 2, timedOut: true }), 0)

    expect(promptAsync).toHaveBeenCalledTimes(1)
    const payload = promptAsync.mock.calls[0]?.[0]
    if (!payload) throw new Error('Expected a prompt payload')
    const text = payload.body.parts[0]?.text ?? ''

    expect(text).toContain('TimeoutSeconds: 2')
    expect(text).toContain('Timed Out: yes')
    expect(text).toContain('Process reached its PTY timeout and was stopped automatically.')
  })
})

import { describe, it, expect } from 'bun:test'
import {
  CustomError,
  type WSMessageClientSubscribeSession,
  type WSMessageServerError,
  type WSMessageServerSessionList,
} from '../src/web/shared/types.ts'
import type { PTYSessionInfo } from '../src/plugin/pty/types.ts'
import moment from 'moment'

describe('Web Types', () => {
  describe('WSMessage', () => {
    it('should validate subscribe message structure', () => {
      const message: WSMessageClientSubscribeSession = {
        type: 'subscribe',
        sessionId: 'pty_12345',
      }

      expect(message.type).toBe('subscribe')
      expect(message.sessionId).toBe('pty_12345')
    })

    it('should validate session_list message structure', () => {
      const sessions: PTYSessionInfo[] = [
        {
          id: 'pty_12345',
          title: 'Test Session',
          command: 'echo',
          status: 'running',
          pid: 1234,
          lineCount: 5,
          createdAt: moment().toISOString(true),
          args: ['hello'],
          workdir: '/home/user',
        },
      ]

      const message: WSMessageServerSessionList = {
        type: 'session_list',
        sessions,
      }

      expect(message.type).toBe('session_list')
      expect(message.sessions).toEqual(sessions)
    })

    it('should validate error message structure', () => {
      const message: WSMessageServerError = {
        type: 'error',
        error: new CustomError('Session not found'),
      }

      expect(message.type).toBe('error')
      expect(message.error.message).toBe('Session not found')
    })
  })

  describe('SessionData', () => {
    it('should validate complete session data structure', () => {
      const session: PTYSessionInfo = {
        id: 'pty_12345',
        title: 'Test Echo Session',
        command: 'echo',
        status: 'exited',
        exitCode: 0,
        pid: 1234,
        lineCount: 2,
        createdAt: moment().toISOString(true),
        args: ['Hello, World!'],
        workdir: '/home/user',
      }

      expect(session.id).toBe('pty_12345')
      expect(session.title).toBe('Test Echo Session')
      expect(session.command).toBe('echo')
      expect(session.status).toBe('exited')
      expect(session.exitCode).toBe(0)
      expect(session.pid).toBe(1234)
      expect(session.lineCount).toBe(2)
      expect(typeof session.createdAt).toBe('string')
    })

    it('should allow optional exitCode', () => {
      const session: PTYSessionInfo = {
        id: 'pty_67890',
        title: 'Running Session',
        command: 'sleep',
        status: 'running',
        pid: 5678,
        lineCount: 0,
        createdAt: moment('2026-01-21T10:00:00.000Z').toISOString(true),
        args: ['Hello, World!'],
        workdir: '/home/user',
      }

      expect(session.exitCode).toBeUndefined()
      expect(session.status).toBe('running')
    })
  })
})

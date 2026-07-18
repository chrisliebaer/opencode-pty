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
  it('includes body.agent when originating agent is present', async () => {
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()

    manager.init({ session: { promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession({ parentAgent: 'agent-two' }), 0)

    expect(promptAsync).toHaveBeenCalledTimes(1)
    const payload = promptAsync.mock.calls[0]![0]

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
    const payload = promptAsync.mock.calls[0]![0]

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
    const payload = promptAsync.mock.calls[0]![0]
    const text = payload.body.parts[0]?.text ?? ''

    expect(text).toContain('TimeoutSeconds: 2')
    expect(text).toContain('Timed Out: yes')
    expect(text).toContain('Process reached its PTY timeout and was stopped automatically.')
  })

  it('strips terminal sequences from the exit notification', async () => {
    const promptAsync = mock(async (_payload: PromptPayload) => {})
    const manager = new NotificationManager()
    const buffer = new RingBuffer()
    buffer.append('useful output\n\x1b[?9001h\x1b[?1004h\n')

    manager.init({ session: { promptAsync } } as unknown as OpencodeClient)

    await manager.sendExitNotification(createSession({ buffer }), 0)

    const text = promptAsync.mock.calls[0]?.[0].body.parts[0]?.text ?? ''
    expect(text).toContain('Last Line: useful output')
    expect(text).not.toContain('\x1b')
  })
})

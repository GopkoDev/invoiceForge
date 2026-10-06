// AC-20: the preview "a client-side error reaches Sentry" check waits for the envelope that
// carries the synthetic error (see tests/e2e/support/sentry-envelope.ts).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isErrorEnvelopeFor,
  SYNTHETIC_CLIENT_ERROR,
} from '../e2e/support/sentry-envelope';

const header = JSON.stringify({
  event_id: '0123456789abcdef0123456789abcdef',
  sent_at: '2026-10-03T10:00:00.000Z',
  sdk: { name: 'sentry.javascript.nextjs', version: '10.0.0' },
});
const envelope = (...items: Array<[Record<string, unknown>, unknown]>) =>
  [
    header,
    ...items.flatMap(([h, p]) => [JSON.stringify(h), JSON.stringify(p)]),
  ].join('\n');
const errorEvent = (value: string) => ({
  exception: {
    values: [{ type: 'Error', value, mechanism: { type: 'onerror' } }],
  },
  level: 'error',
});

describe('isErrorEnvelopeFor (R-16)', () => {
  it('matches the error event that carries the synthetic message', () => {
    expect(
      isErrorEnvelopeFor(
        envelope([{ type: 'event' }, errorEvent(SYNTHETIC_CLIENT_ERROR)]),
        SYNTHETIC_CLIENT_ERROR
      )
    ).toBe(true);
  });

  it('matches it after another item in the same envelope', () => {
    expect(
      isErrorEnvelopeFor(
        envelope(
          [{ type: 'session' }, { sid: 'abc', status: 'ok', errors: 0 }],
          [{ type: 'event' }, errorEvent(SYNTHETIC_CLIENT_ERROR)]
        ),
        SYNTHETIC_CLIENT_ERROR
      )
    ).toBe(true);
  });

  it.each([
    [
      'a session update',
      envelope([{ type: 'session' }, { sid: 'abc', status: 'ok', errors: 1 }]),
    ],
    [
      'a transaction',
      envelope([{ type: 'transaction' }, { transaction: '/login', spans: [] }]),
    ],
    ['a replay', envelope([{ type: 'replay_event' }, { replay_id: 'r1' }])],
    [
      'a log that quotes the message',
      envelope([
        { type: 'log' },
        { items: [{ body: SYNTHETIC_CLIENT_ERROR }] },
      ]),
    ],
    [
      'another error',
      envelope([{ type: 'event' }, errorEvent('ChunkLoadError')]),
    ],
    [
      'a message event that only names it',
      envelope([{ type: 'event' }, { message: SYNTHETIC_CLIENT_ERROR }]),
    ],
    ['an empty body', ''],
    ['no body', null],
    ['a body that is not an envelope', `not json\n${SYNTHETIC_CLIENT_ERROR}`],
  ])('rejects %s', (_name, body) => {
    expect(isErrorEnvelopeFor(body, SYNTHETIC_CLIENT_ERROR)).toBe(false);
  });

  it('csp-gate waits for this envelope, and throws the same message', () => {
    const spec = fs.readFileSync(
      path.join(process.cwd(), 'tests/e2e/csp-gate.spec.ts'),
      'utf8'
    );
    expect(spec).toContain('isErrorEnvelopeFor(');
    expect(spec).toContain('SYNTHETIC_CLIENT_ERROR');
    expect(spec).not.toContain("'T20 synthetic client error'");
  });
});

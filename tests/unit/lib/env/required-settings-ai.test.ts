// ai-assistant T04 - the AI settings and the pinned AI packages (sad.md §2, §7; ADR-0003).
// The build fails naming a missing AI key; AI_CHAT_MODEL is optional with a Flash-Lite default.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OPTIONAL_SETTINGS,
  REQUIRED_SETTINGS,
  missingSettings,
} from '@/lib/env/required-settings';

const root = path.resolve(__dirname, '../../../..');

function fullEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_SETTINGS.map((n) => [n, 'x']));
}

describe('AI settings', () => {
  it('requires AI_GATEWAY_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY', () => {
    expect(REQUIRED_SETTINGS).toContain('AI_GATEWAY_API_KEY');
    expect(REQUIRED_SETTINGS).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  });

  it('names each AI key when it is missing', () => {
    for (const name of ['AI_GATEWAY_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) {
      const env = fullEnv();
      delete env[name];
      expect(missingSettings(env)).toEqual([name]);
    }
  });

  it('treats AI_CHAT_MODEL as optional, never required', () => {
    expect(OPTIONAL_SETTINGS).toContain('AI_CHAT_MODEL');
    expect(REQUIRED_SETTINGS).not.toContain('AI_CHAT_MODEL');
    expect(missingSettings(fullEnv())).toEqual([]);
  });

  it('fails the build check naming both AI keys when they are unset', () => {
    const env = fullEnv();
    delete env.AI_GATEWAY_API_KEY;
    delete env.GOOGLE_GENERATIVE_AI_API_KEY;
    const res = spawnSync('node', ['scripts/check-required-settings.ts'], {
      cwd: root,
      env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('AI_GATEWAY_API_KEY');
    expect(res.stderr).toContain('GOOGLE_GENERATIVE_AI_API_KEY');
  });
});

describe('getChatModel', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = 'test-gateway-key';
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-google-key';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to a Gemini Flash-Lite model when AI_CHAT_MODEL is unset', async () => {
    delete process.env.AI_CHAT_MODEL;
    const { getChatModel } = await import('@/lib/ai/model');
    const model = getChatModel() as { modelId: string };
    expect(model.modelId).toMatch(/gemini.*flash-lite/i);
  });

  it('resolves the model id from AI_CHAT_MODEL when set', async () => {
    process.env.AI_CHAT_MODEL = 'google/gemini-2.5-flash';
    const { getChatModel } = await import('@/lib/ai/model');
    const model = getChatModel() as { modelId: string };
    expect(model.modelId).toBe('google/gemini-2.5-flash');
  });
});

describe('pinned AI packages (sad.md §2, §11 risk 4)', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  const EXACT = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

  it.each(['ai', '@ai-sdk/gateway', '@ai-sdk/google', '@ai-sdk/react', '@mastra/core', '@mastra/pg'])(
    '%s is an exact version, no range',
    (name) => {
      expect(pkg.dependencies[name], `${name} missing from dependencies`).toMatch(EXACT);
    }
  );

  it('every @mastra/* package is exactly pinned', () => {
    const mastra = Object.entries(pkg.dependencies).filter(([n]) => n.startsWith('@mastra/'));
    expect(mastra.length).toBeGreaterThanOrEqual(2);
    for (const [n, v] of mastra) expect(v, n).toMatch(EXACT);
  });

  it('has a mastra:migrate script', () => {
    expect(pkg.scripts['mastra:migrate']).toMatch(/mastra-migrate/);
  });

  it('declares the Mastra packages server-external in next.config.ts', () => {
    const cfg = readFileSync(path.join(root, 'next.config.ts'), 'utf8');
    expect(cfg).toMatch(/serverExternalPackages[\s\S]*@mastra\//);
  });
});

// ai-chat-v2 T90 (AC-35; review 2026-10-15 F2/F3): the privacy §5 and terms §10 sub-processor tables list
// the AI model provider, and privacy §5 no longer claims processors only handle technical infrastructure.
import { describe, expect, it } from 'vitest';
import { privacyContent, termsContent } from '@/constants/public-pages-content';

function section(content: { sections: { id: string }[] }, match: RegExp) {
  const found = content.sections.find((s) => match.test(s.id));
  expect(found, `section ${match}`).toBeDefined();
  return JSON.stringify(found);
}

describe('sub-processor tables name the AI model provider (T90)', () => {
  it('privacy §5 includes an Anthropic (via Vercel AI Gateway) row for the AI assistant', () => {
    const text = section(privacyContent as never, /processor|third|sharing|recipient/i);
    expect(text).toMatch(/Anthropic[^"]*Vercel AI Gateway/);
    expect(text).toMatch(/AI assistant/i);
  });

  it('privacy §5 no longer says processors only handle the technical infrastructure', () => {
    const text = section(privacyContent as never, /processor|third|sharing|recipient/i);
    expect(text).not.toMatch(/only handle the technical infrastructure/i);
  });

  it('terms §10 includes an Anthropic (via Vercel AI Gateway) row for the AI assistant', () => {
    const all = JSON.stringify(termsContent);
    expect(all).toMatch(/Anthropic[^"]*Vercel AI Gateway/);
    expect(all).toMatch(/AI assistant/i);
  });

  it('terms §10 transfer sentence covers every listed provider, not only Vercel and Neon (T94)', () => {
    const all = JSON.stringify(termsContent);
    expect(all).not.toMatch(/Both Vercel and Neon comply/);
    expect(all).toMatch(/All providers listed/);
  });

  it('privacy §5 Vercel row names the AI Gateway for AI assistant message text (T101)', () => {
    const found = privacyContent.sections.find((s) => /processor|third|sharing|recipient/i.test(s.id)) as never as {
      table: { rows: { service: string; purpose: string; data: string }[] };
    };
    const row = found.table.rows.find((r) => r.service === 'Vercel');
    expect(row, 'Vercel row').toBeDefined();
    expect(JSON.stringify(row)).toMatch(/AI Gateway/);
    expect(JSON.stringify(row)).toMatch(/message text/i);
  });

  // T109 (SEC-I-03, owner option A): the real hosting locations, the US model transfer, zero data retention.
  type Row = Record<string, string>;
  function rows(content: unknown): Row[] {
    const out: Row[] = [];
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') {
        const o = n as Record<string, unknown>;
        if (Array.isArray(o.rows)) out.push(...(o.rows as Row[]));
        Object.values(o).forEach(walk);
      }
    };
    walk(content);
    return out;
  }
  const name = (r: Row) => r.provider ?? r.service;

  describe.each([
    ['privacy §5', privacyContent],
    ['terms §10', termsContent],
  ])('%s locations (T109)', (_label, content) => {
    it('lists Vercel and Neon in the EU (Frankfurt), not the USA', () => {
      const all = rows(content);
      const vercel = all.find((r) => name(r) === 'Vercel')!;
      const neon = all.find((r) => name(r) === 'Neon')!;
      expect(vercel.location).toMatch(/EU.*Frankfurt/);
      expect(vercel.location).not.toMatch(/USA/);
      expect(neon.location).toMatch(/EU.*Frankfurt/);
      expect(neon.location).not.toMatch(/USA/);
    });

    it('keeps Anthropic in the USA and says zero data retention', () => {
      const row = rows(content).find((r) => /^Anthropic/.test(name(r)))!;
      expect(row.location).toBe('USA');
      expect(JSON.stringify(row)).toMatch(/zero data retention/i);
    });

    it('the transfer sentence names the US transfer under SCCs', () => {
      const text = JSON.stringify(content);
      const m = text.match(/[^"]*Standard Contractual Clauses[^"]*/g) ?? [];
      const sentence = m.find((t) => /SCC/.test(t) && /USA|United States/.test(t));
      expect(sentence, 'transfer sentence with SCC and USA').toBeDefined();
    });

    // T111 (review Z-1..Z-6): no overclaiming of where processing happens; Sentry is listed.
    function strings(n: unknown, out: string[] = []): string[] {
      if (typeof n === 'string') out.push(n);
      else if (Array.isArray(n)) n.forEach((x) => strings(x, out));
      else if (n && typeof n === 'object') Object.values(n).forEach((x) => strings(x, out));
      return out;
    }

    it('Vercel row names the AI Gateway and global scope; location may stay EU Frankfurt (T111)', () => {
      const vercel = rows(content).find((r) => name(r) === 'Vercel')!;
      expect(JSON.stringify(vercel)).toMatch(/AI Gateway/);
      expect(vercel.location).toMatch(/global/i);
      expect(vercel.location).toMatch(/EU.*Frankfurt/);
    });

    it('one transfer sentence names Vercel and Neon, SCCs and the sign-in providers safeguard (T111)', () => {
      const sentence = strings(content).find((t) => /Standard Contractual Clauses/.test(t) && /USA|United States/.test(t));
      expect(sentence, 'transfer sentence').toBeDefined();
      expect(sentence).toMatch(/Vercel and Neon/);
      expect(sentence).toMatch(/Standard Contractual Clauses/);
      expect(sentence).toMatch(/Data Privacy Framework|own SCCs/);
    });

    it('no dangling "All providers listed above are covered." (T111)', () => {
      for (const t of strings(content)) {
        expect(t).not.toMatch(/All providers listed above are covered\.?$/);
      }
      const all = strings(content).join('\n');
      if (/All providers listed/.test(all)) expect(all).toMatch(/All providers listed[^.]*covered by data processing agreements/);
    });

    it('lists Sentry for error monitoring with an EU location (T111)', () => {
      const sentry = rows(content).find((r) => name(r) === 'Sentry');
      expect(sentry, 'Sentry row').toBeDefined();
      expect(sentry!.location).toMatch(/EU/);
      expect(JSON.stringify(sentry)).toMatch(/error/i);
    });
  });
});

describe('privacy §11 AI section wording is not overclaimed in the content constants (T111)', () => {
  it('terms and privacy tables do not claim the model runs in the USA', () => {
    expect(JSON.stringify(privacyContent)).not.toMatch(/runs in the USA/i);
  });
});

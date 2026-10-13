import { describe, expect, it } from 'vitest';
import { protectedRoutes } from '@/config/routes.config';
import { appPageKeySchema, type AppPageKey } from '@/lib/validations/assistant-chat';
import { APP_MAP, appPageRoute, findInApp } from '@/lib/ai/app-map';
import { createFindInAppTool } from '@/lib/ai/tools/find-in-app';

// T13 (ai-assistant, AC-07, ADR-0010): find_in_app answers from a fixed map of the app's real pages.
const SAMPLE_ID = 'cmsample0000000000000000';

/** Every concrete private route config/routes.config.ts defines (dynamic ones with a sample id). */
function configuredRoutes(): Set<string> {
  const found = new Set<string>();
  for (const value of Object.values(protectedRoutes)) {
    found.add(typeof value === 'function' ? value(SAMPLE_ID) : value);
  }
  return found;
}

const EXPECTED: Record<AppPageKey, string> = {
  dashboard: '/dashboard',
  invoices: '/invoices',
  'new-invoice': '/invoices/new',
  customers: '/customers',
  'new-customer': '/customers/new',
  products: '/products',
  'new-product': '/products/new',
  'sender-profiles': '/sender-profiles',
  'new-sender-profile': '/sender-profiles/new',
  'sender-profile-bank-accounts': `/sender-profiles/${SAMPLE_ID}/edit/bank-accounts`,
  'settings-profile': '/settings/profile',
  'settings-privacy': '/settings/privacy',
  'settings-assistants': '/settings/assistants',
  ai: '/ai',
};

describe('fixed app map (T13, AC-07)', () => {
  // ai-chat-v2 AC-05, SCR-03 "answered — nothing matches" (review 2026-10-13 R1-U5): the add pages and their titles.
  it('holds the add-Customer and add-product pages, titled as the "nothing matches" links', () => {
    const title = (page: AppPageKey) => APP_MAP.find((e) => e.page === page)?.title;
    expect(title('new-customer')).toBe('Add a Customer');
    expect(title('new-product')).toBe('Add a product');
    expect(appPageRoute('new-product')).toBe('/products/new');
  });

  it('has exactly one entry for every AppPageKey, each with a title and what is set there', () => {
    expect(APP_MAP.map((e: { page: AppPageKey }) => e.page).sort()).toEqual([...appPageKeySchema.options].sort());
    for (const entry of APP_MAP) {
      expect(entry.title.trim()).not.toBe('');
      expect(entry.whatIsSetThere.trim()).not.toBe('');
    }
  });

  it.each(appPageKeySchema.options)('%s resolves to a route that exists in config/routes.config.ts', (page) => {
    const route = appPageRoute(page, page === 'sender-profile-bank-accounts' ? SAMPLE_ID : undefined);
    expect(route).toBe(EXPECTED[page]);
    expect(configuredRoutes().has(route)).toBe(true);
  });

  it('the bank-accounts page needs a sender profile id, no other page takes one', () => {
    expect(() => appPageRoute('sender-profile-bank-accounts')).toThrow();
    expect(appPageRoute('dashboard', SAMPLE_ID)).toBe('/dashboard');
  });

  it('"where do I change the logo" finds the sender profiles page first (AC-07)', () => {
    const pages = findInApp('change the logo on my invoices');
    expect(pages[0]?.page).toBe('sender-profiles');
    for (const p of pages) expect(appPageKeySchema.safeParse(p.page).success).toBe(true);
  });

  it('find_in_app answers { pages } with real page keys only, and never invents one', async () => {
    const tool = createFindInAppTool();
    expect(tool.id).toBe('find_in_app');
    const answer = (await tool.execute!({ topic: 'logo' }, {} as never)) as { pages: Array<{ page: string; title: string; whatIsSetThere: string }> };
    expect(answer.pages[0]).toMatchObject({ page: 'sender-profiles' });
    for (const p of answer.pages) {
      expect(appPageKeySchema.safeParse(p.page).success).toBe(true);
      expect(p.title).toBeTruthy();
      expect(p.whatIsSetThere).toBeTruthy();
    }
    const nothing = (await tool.execute!({ topic: 'zzqx nonsense topic' }, {} as never)) as { pages: unknown[] };
    expect(Array.isArray(nothing.pages)).toBe(true);
  });
});

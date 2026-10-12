import { protectedRoutes } from '@/config/routes.config';
import type { AppPageKey } from '@/lib/validations/assistant-chat';

export interface AppMapEntry {
  page: AppPageKey;
  title: string;
  whatIsSetThere: string;
  /** Lower-case words a question about this page is likely to contain. */
  keywords: readonly string[];
}

/** The fixed map of the app's real pages: the only places the Assistant may point to (AC-07). */
export const APP_MAP: readonly AppMapEntry[] = [
  {
    page: 'dashboard',
    title: 'Dashboard',
    whatIsSetThere: 'Summary figures, overdue invoices, Debtors and expected payments.',
    keywords: ['dashboard', 'summary', 'overview', 'figures', 'revenue', 'debtors', 'overdue', 'expected'],
  },
  {
    page: 'invoices',
    title: 'Invoices',
    whatIsSetThere: 'All invoices; open, edit, send, mark paid or cancel one.',
    keywords: ['paid', 'status', 'send', 'cancel', 'due'],
  },
  {
    page: 'new-invoice',
    title: 'New invoice',
    whatIsSetThere: 'Create an invoice: customer, sender profile, lines, dates and currency.',
    keywords: ['new', 'create', 'invoice', 'lines', 'currency', 'issue'],
  },
  {
    page: 'customers',
    title: 'Customers',
    whatIsSetThere: 'Your customers and their details; open or edit one.',
    keywords: ['customer', 'customers', 'client', 'clients', 'contact'],
  },
  {
    page: 'new-customer',
    title: 'New customer',
    whatIsSetThere: 'Add a customer: name, company, tax id and address.',
    keywords: ['new', 'add', 'create', 'customer', 'client'],
  },
  {
    page: 'products',
    title: 'Products',
    whatIsSetThere: 'Products and services you invoice for, their prices and custom prices per customer.',
    keywords: ['product', 'products', 'service', 'services', 'price', 'prices', 'catalog', 'unit'],
  },
  {
    page: 'sender-profiles',
    title: 'Sender profiles',
    whatIsSetThere: 'The business identity printed on invoices: name, logo, address, tax id and payment terms.',
    keywords: ['sender', 'profile', 'profiles', 'logo', 'brand', 'branding', 'business', 'address', 'tax', 'letterhead', 'terms'],
  },
  {
    page: 'new-sender-profile',
    title: 'New sender profile',
    whatIsSetThere: 'Create another sender profile for a different business identity.',
    keywords: ['new', 'add', 'create', 'sender', 'profile'],
  },
  {
    page: 'sender-profile-bank-accounts',
    title: 'Sender profile bank accounts',
    whatIsSetThere: 'The bank accounts and IBANs shown on invoices for one sender profile.',
    keywords: ['bank', 'account', 'accounts', 'iban', 'swift', 'payment', 'details'],
  },
  {
    page: 'settings-profile',
    title: 'Profile settings',
    whatIsSetThere: 'Your name, time zone and account details.',
    keywords: ['settings', 'profile', 'name', 'timezone', 'time', 'zone', 'account', 'email'],
  },
  {
    page: 'settings-privacy',
    title: 'Privacy settings',
    whatIsSetThere: 'Privacy choices, your data and deleting your account.',
    keywords: ['privacy', 'data', 'delete', 'export', 'gdpr'],
  },
  {
    page: 'settings-assistants',
    title: 'Assistants settings',
    whatIsSetThere: 'Connect your own AI assistant with a Personal key, and its Draft permission.',
    keywords: ['assistant', 'assistants', 'mcp', 'key', 'keys', 'connect', 'token', 'claude', 'chatgpt'],
  },
  {
    page: 'ai',
    title: 'Assistant chat',
    whatIsSetThere: 'Chat with the Assistant about your invoices, customers and drafts.',
    keywords: ['chat', 'assistant', 'ask', 'ai'],
  },
];

/** The route of a page key, from config/routes.config.ts. The bank-accounts page needs the profile id. */
export function appPageRoute(page: AppPageKey, senderProfileId?: string): string {
  switch (page) {
    case 'dashboard':
      return protectedRoutes.dashboard;
    case 'invoices':
      return protectedRoutes.invoices;
    case 'new-invoice':
      return protectedRoutes.invoicesNew;
    case 'customers':
      return protectedRoutes.customers;
    case 'new-customer':
      return protectedRoutes.customersNew;
    case 'products':
      return protectedRoutes.products;
    case 'sender-profiles':
      return protectedRoutes.senderProfiles;
    case 'new-sender-profile':
      return protectedRoutes.senderProfilesNew;
    case 'sender-profile-bank-accounts':
      if (!senderProfileId) throw new Error('sender-profile-bank-accounts needs a senderProfileId');
      return protectedRoutes.senderProfileEditBankAccounts(senderProfileId);
    case 'settings-profile':
      return protectedRoutes.settingsProfile;
    case 'settings-privacy':
      return protectedRoutes.settingsPrivacy;
    case 'settings-assistants':
      return protectedRoutes.settingsAssistants;
    case 'ai':
      return protectedRoutes.ai;
  }
}

const MAX_RESULTS = 3;

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Pages that match the topic, best first; empty when nothing matches. Page order breaks ties. */
export function findInApp(topic: string): Array<Pick<AppMapEntry, 'page' | 'title' | 'whatIsSetThere'>> {
  const asked = new Set(words(topic));
  return APP_MAP.map((entry, index) => {
    const titleWords = new Set(words(entry.title));
    let score = 0;
    for (const w of asked) {
      if (entry.keywords.includes(w)) score += 2;
      if (titleWords.has(w)) score += 1;
    }
    return { entry, index, score };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_RESULTS)
    .map(({ entry }) => ({ page: entry.page, title: entry.title, whatIsSetThere: entry.whatIsSetThere }));
}

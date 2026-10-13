// The words the chat falls back on when the model answers a propose_draft ISSUES result with no text of
// its own (fix 2026-10-12, AC-19 "the chat says so"): one sentence per issue, in the message's language.
import type { DraftIssue } from '@/lib/services/assistant-drafts/schema';

type Language = 'en' | 'uk';

const list = (items: string[]) => items.join(', ');
const accountsWithCurrency = (
  accounts: { label: string; currency: string }[]
) => list(accounts.map((a) => `${a.label} (${a.currency})`));
const namesOf = (rows: { name: { freelancerText: string } }[]) =>
  list(rows.map((r) => r.name.freelancerText));
const productsWithCurrency = (
  products: { name: { freelancerText: string }; currency: string }[]
) => list(products.map((p) => `${p.name.freelancerText} (${p.currency})`));

const SENTENCES: Record<Language, (issue: DraftIssue) => string> = {
  en: (issue) => {
    switch (issue.kind) {
      case 'NO_SENDER_PROFILE_WITH_ACCOUNT':
        return 'To draft an invoice, you first need a sender profile with a bank account.';
      case 'DEFAULT_PROFILE_WITHOUT_ACCOUNT':
        return 'Your default sender profile has no bank account. Add one, or name another sender profile to draft under.';
      case 'CUSTOMER_NOT_FOUND':
        return issue.ownSenderProfile
          ? `${issue.ownSenderProfile.name.freelancerText} is your own sender profile — the business you invoice from. A Customer is the one who pays. Which Customer should this invoice go to?`
          : `You have no Customer called ${issue.written}. Add the Customer first.`;
      case 'CUSTOMER_AMBIGUOUS':
        return `Several Customers match ${issue.written}: ${list(issue.candidates.map((c) => c.name.freelancerText))}. Which one do you mean?`;
      case 'CUSTOMER_NEAR_MISS':
        return `No Customer is called ${issue.written}. Did you mean ${list(issue.candidates.map((c) => c.name.freelancerText))}?`;
      case 'LINE_AMOUNT_MISSING':
        return `What is the amount for "${issue.description}"? Give the quantity and the price.`;
      case 'LINE_QUANTITY_MISSING':
        return `What is the quantity for "${issue.description}"?`;
      case 'LINE_PRICE_MISSING_IN_CURRENCY':
        return issue.products.length > 0
          ? `The matching catalogue product is priced in another currency than the invoice (${issue.currency}): ${productsWithCurrency(issue.products)}. What is the price in ${issue.currency} for line ${issue.lineIndex + 1}? Or draft the invoice in the product's currency.`
          : `What is the price in ${issue.currency} for line ${issue.lineIndex + 1}?`;
      case 'CURRENCY_UNCLEAR':
        return `Which currency do you mean by ${issue.written}: ${list(issue.options)}?`;
      case 'SENDER_PROFILE_NOT_FOUND':
        return `You have no sender profile called ${issue.written}. Your sender profiles: ${list(issue.options)}.`;
      case 'NO_ACCOUNT_IN_CURRENCY':
        return (
          (issue.accounts.length > 0
            ? `This sender profile has no bank account in ${issue.currency}. Its accounts: ${accountsWithCurrency(issue.accounts)}. Add a ${issue.currency} account, or draft the invoice in the currency of one of these.`
            : `This sender profile has no bank account in ${issue.currency}. Add one first.`) +
          (issue.otherProfiles.length > 0
            ? ` Your sender profile ${namesOf(issue.otherProfiles)} has a ${issue.currency} account: name it to draft from it.`
            : '')
        );
      case 'SEVERAL_ACCOUNTS_IN_CURRENCY':
        return `You have several bank accounts in ${issue.currency}: ${list(issue.accounts.map((a) => a.label))}. Which one should the invoice use?`;
      case 'BANK_ACCOUNT_NOT_FOUND':
        return `No bank account matches ${issue.written}. Your accounts: ${list(issue.accounts.map((a) => a.label))}.`;
      case 'BANK_ACCOUNT_AMBIGUOUS':
        return `Several bank accounts match ${issue.written}: ${list(issue.accounts.map((a) => a.label))}. Which one do you mean?`;
      case 'BANK_ACCOUNT_CURRENCY_MISMATCH':
        return `${issue.account.label} is in ${issue.account.currency}, but the invoice is in ${issue.currency}. An invoice and its bank account share one currency: draft it in ${issue.account.currency}, or add a ${issue.currency} account.`;
      case 'PRODUCT_AMBIGUOUS':
        return `Several products match ${issue.written}: ${list(issue.candidates.map((c) => c.name.freelancerText))}. Which one do you mean?`;
      case 'PRODUCT_NOT_FOUND':
        return `No product matches ${issue.written}. Give the line's quantity and price instead.`;
      case 'FIELD_INVALID':
        return issue.message;
    }
  },
  uk: (issue) => {
    switch (issue.kind) {
      case 'NO_SENDER_PROFILE_WITH_ACCOUNT':
        return 'Щоб створити інвойс, спершу потрібен профіль відправника з банківським рахунком.';
      case 'DEFAULT_PROFILE_WITHOUT_ACCOUNT':
        return 'У вашого профілю відправника за замовчуванням немає банківського рахунку. Додайте його або назвіть інший профіль.';
      case 'CUSTOMER_NOT_FOUND':
        return issue.ownSenderProfile
          ? `${issue.ownSenderProfile.name.freelancerText} — це ваш профіль відправника, бізнес, від імені якого ви виставляєте інвойси. Клієнт — це той, хто платить. Якому клієнту виставити цей інвойс?`
          : `У вас немає клієнта ${issue.written}. Спершу додайте клієнта.`;
      case 'CUSTOMER_AMBIGUOUS':
        return `Під ${issue.written} підходить кілька клієнтів: ${list(issue.candidates.map((c) => c.name.freelancerText))}. Кого саме ви маєте на увазі?`;
      case 'CUSTOMER_NEAR_MISS':
        return `Клієнта ${issue.written} немає. Можливо, ви мали на увазі ${list(issue.candidates.map((c) => c.name.freelancerText))}?`;
      case 'LINE_AMOUNT_MISSING':
        return `Яка сума для «${issue.description}»? Вкажіть кількість і ціну.`;
      case 'LINE_QUANTITY_MISSING':
        return `Яка кількість для «${issue.description}»?`;
      case 'LINE_PRICE_MISSING_IN_CURRENCY':
        return issue.products.length > 0
          ? `Відповідний продукт із каталогу має ціну в іншій валюті, ніж інвойс (${issue.currency}): ${productsWithCurrency(issue.products)}. Яка ціна в ${issue.currency} для рядка ${issue.lineIndex + 1}? Або створіть інвойс у валюті продукту.`
          : `Яка ціна в ${issue.currency} для рядка ${issue.lineIndex + 1}?`;
      case 'CURRENCY_UNCLEAR':
        return `Яку валюту ви маєте на увазі під ${issue.written}: ${list(issue.options)}?`;
      case 'SENDER_PROFILE_NOT_FOUND':
        return `Профілю відправника ${issue.written} немає. Ваші профілі: ${list(issue.options)}.`;
      case 'NO_ACCOUNT_IN_CURRENCY':
        return (
          (issue.accounts.length > 0
            ? `У цього профілю відправника немає банківського рахунку в ${issue.currency}. Його рахунки: ${accountsWithCurrency(issue.accounts)}. Додайте рахунок у ${issue.currency} або створіть інвойс у валюті одного з цих рахунків.`
            : `У цього профілю відправника немає банківського рахунку в ${issue.currency}. Спершу додайте його.`) +
          (issue.otherProfiles.length > 0
            ? ` Рахунок у ${issue.currency} є у вашого профілю відправника ${namesOf(issue.otherProfiles)}: назвіть його, щоб створити інвойс від нього.`
            : '')
        );
      case 'SEVERAL_ACCOUNTS_IN_CURRENCY':
        return `У вас кілька рахунків у ${issue.currency}: ${list(issue.accounts.map((a) => a.label))}. Який використати для інвойсу?`;
      case 'BANK_ACCOUNT_NOT_FOUND':
        return `Жоден рахунок не підходить під ${issue.written}. Ваші рахунки: ${list(issue.accounts.map((a) => a.label))}.`;
      case 'BANK_ACCOUNT_AMBIGUOUS':
        return `Під ${issue.written} підходить кілька рахунків: ${list(issue.accounts.map((a) => a.label))}. Який саме?`;
      case 'BANK_ACCOUNT_CURRENCY_MISMATCH':
        return `Рахунок ${issue.account.label} у ${issue.account.currency}, а інвойс у ${issue.currency}. Інвойс і рахунок мають бути в одній валюті: створіть інвойс у ${issue.account.currency} або додайте рахунок у ${issue.currency}.`;
      case 'PRODUCT_AMBIGUOUS':
        return `Під ${issue.written} підходить кілька продуктів: ${list(issue.candidates.map((c) => c.name.freelancerText))}. Який саме?`;
      case 'PRODUCT_NOT_FOUND':
        return `Продукту ${issue.written} немає. Вкажіть кількість і ціну для цього рядка.`;
      case 'FIELD_INVALID':
        return issue.message;
    }
  },
};

/**
 * Above 8 matches (AC-14; review 2026-10-13 R2-B2, R3-B3) the tool answer drops the long lists: the chat says how many
 * there are and asks for a more exact name. `count` is the dropped list's length. Null for an issue that keeps its
 * own sentence.
 */
function countSentence(issue: DraftIssue, count: number, language: Language): string | null {
  const uk = language === 'uk';
  switch (issue.kind) {
    case 'CUSTOMER_AMBIGUOUS':
      return uk
        ? `Під ${issue.written} підходять ${count} клієнтів. Напишіть точнішу назву.`
        : `${count} Customers match ${issue.written}. Type a more exact name.`;
    case 'CUSTOMER_NEAR_MISS':
      return uk
        ? `Клієнта ${issue.written} немає; схожу назву мають ${count} клієнтів: напишіть точнішу назву.`
        : `No Customer is called ${issue.written}. ${count} Customers have a similar name: type a more exact name.`;
    case 'PRODUCT_AMBIGUOUS':
      return uk
        ? `Під ${issue.written} підходять ${count} продуктів. Напишіть точнішу назву.`
        : `${count} products match ${issue.written}. Type a more exact name.`;
    case 'SEVERAL_ACCOUNTS_IN_CURRENCY':
      return uk
        ? `У вас ${count} рахунків у ${issue.currency}. Назвіть той, який використати для інвойсу.`
        : `You have ${count} bank accounts in ${issue.currency}. Name the one the invoice should use.`;
    case 'BANK_ACCOUNT_AMBIGUOUS':
      return uk
        ? `Під ${issue.written} підходять ${count} рахунків. Напишіть точнішу назву.`
        : `${count} bank accounts match ${issue.written}. Type a more exact name.`;
    case 'BANK_ACCOUNT_NOT_FOUND':
      return uk
        ? `Жоден рахунок не підходить під ${issue.written}. У вас ${count} рахунків: напишіть точнішу назву.`
        : `No bank account matches ${issue.written}. You have ${count} bank accounts: type a more exact name.`;
    case 'SENDER_PROFILE_NOT_FOUND':
      return uk
        ? `Профілю відправника ${issue.written} немає. У вас ${count} профілів відправника: напишіть точнішу назву.`
        : `You have no sender profile called ${issue.written}. You have ${count} sender profiles: type a more exact name.`;
    case 'NO_ACCOUNT_IN_CURRENCY':
      return uk
        ? `У цього профілю відправника немає банківського рахунку в ${issue.currency}. Спершу додайте його. Рахунок у ${issue.currency} мають ${count} інших ваших профілів відправника: назвіть один, щоб створити інвойс від нього.`
        : `This sender profile has no bank account in ${issue.currency}. Add one first. ${count} of your other sender profiles have a ${issue.currency} account: name one to draft from it.`;
    default:
      return null;
  }
}

/**
 * One paragraph naming every issue, in the message's language (English unless it is Ukrainian). `counts`, aligned
 * with the issues, are the lengths of the lists the propose_draft answer dropped above 8 matches (AC-14).
 */
export function issuesText(issues: DraftIssue[], language: string, counts?: ReadonlyArray<number | null>): string {
  const lang: Language = language === 'uk' ? 'uk' : 'en';
  const sentence = SENTENCES[lang];
  return issues
    .map((issue, i) => {
      const count = counts?.[i];
      return (typeof count === 'number' ? countSentence(issue, count, lang) : null) ?? sentence(issue);
    })
    .join(' ');
}

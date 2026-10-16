export type RouterLanguage = 'en' | 'uk';

// Spec §5: the fixed one-sentence refusal for an entirely off-topic message, in the message's language.
export const OFF_TOPIC_REFUSAL: Record<RouterLanguage, string> = {
  en: 'I can only help with your own data in Invoice Forge, drafting invoices, and finding things in the app.',
  uk: 'Я можу допомагати лише з вашими даними в Invoice Forge, складанням інвойсів і пошуком потрібного в застосунку.',
};

// Handed to the agent for a mixed message: do the in-scope part, decline the rest briefly.
export const MIXED_INSTRUCTION =
  'The user message mixes an in-scope request with an out-of-scope one. Answer or perform only the in-scope part, and decline the out-of-scope part in one sentence. Reply in the language of the user message.';

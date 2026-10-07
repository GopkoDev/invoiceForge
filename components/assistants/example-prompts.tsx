import { CopyButton } from '@/components/ui/copy-button';

const PROMPTS = [
  'Who owes me money right now, and how many days overdue is each invoice?',
  'Which payments am I expecting this month?',
  "Give me this month's totals: invoiced, paid and overdue.",
];

export function ExamplePrompts() {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Try asking</h2>
      <ul className="space-y-2">
        {PROMPTS.map((prompt) => (
          <li
            key={prompt}
            className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
          >
            <span className="text-sm">{prompt}</span>
            <CopyButton value={prompt} what="prompt" />
          </li>
        ))}
      </ul>
    </section>
  );
}

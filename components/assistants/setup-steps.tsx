import { CopyButton } from '@/components/ui/copy-button';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

const PLACEHOLDER = 'YOUR_KEY';

interface SetupStepsProps {
  /** App origin, e.g. https://app.example.com */
  origin: string;
  /** When given, replaces the YOUR_KEY placeholder in every snippet. */
  fullKey?: string;
}

function Snippet({ code, what }: { code: string; what: string }) {
  return (
    <div className="bg-muted flex items-start gap-2 rounded-md border p-2">
      <pre className="min-w-0 flex-1 overflow-x-auto text-xs">
        <code>{code}</code>
      </pre>
      <CopyButton value={code} what={what} />
    </div>
  );
}

export function SetupSteps({ origin, fullKey }: SetupStepsProps) {
  const key = fullKey ?? PLACEHOLDER;
  const url = `${origin}/api/mcp`;

  const claudeCode = `claude mcp add --transport http --scope user invoiceflow ${url} --header "Authorization: Bearer ${key}"`;
  const cursor = JSON.stringify(
    {
      mcpServers: {
        invoiceflow: { url, headers: { Authorization: `Bearer ${key}` } },
      },
    },
    null,
    2
  );
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        invoiceflow: {
          command: 'npx',
          args: ['mcp-remote', url, '--header', 'Authorization:${AUTH}'],
          env: { AUTH: `Bearer ${key}` },
        },
      },
    },
    null,
    2
  );

  const note = (
    <p className="text-muted-foreground text-sm">
      Keep the key in your user settings, never in a project file.
    </p>
  );

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Set up your assistant</h2>
      <Tabs defaultValue="claude-code">
        <TabsList>
          <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="claude-desktop">Claude Desktop</TabsTrigger>
        </TabsList>
        <TabsContent value="claude-code" className="space-y-2">
          {note}
          <p className="text-sm">Run in a terminal:</p>
          <Snippet code={claudeCode} what="command" />
        </TabsContent>
        <TabsContent value="cursor" className="space-y-2">
          {note}
          <p className="text-sm">
            Add to the global <code>~/.cursor/mcp.json</code> (not the
            project&apos;s <code>.cursor/mcp.json</code>):
          </p>
          <Snippet code={cursor} what="config" />
        </TabsContent>
        <TabsContent value="claude-desktop" className="space-y-2">
          {note}
          <p className="text-sm">
            Needs Node.js. Add to <code>claude_desktop_config.json</code>{' '}
            (Settings → Developer → Edit config), then restart Claude Desktop:
          </p>
          <Snippet code={claudeDesktop} what="config" />
        </TabsContent>
      </Tabs>
    </section>
  );
}

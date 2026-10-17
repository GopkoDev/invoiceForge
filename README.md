# Invoice Forge

> Invoices for freelancers and small businesses, with an AI assistant that turns one sentence into an invoice draft

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://invoiceforge.hopko.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org)

## ✨ Features

- ✨ **AI chat** - Ask about your own invoices (who owes you, what is overdue) and get an invoice draft from one sentence. The AI asks when a detail is missing, and a draft exists only after you press Create. It never issues or sends an invoice. The chat has a daily message limit.
- 🔌 **Your own AI tools** - Connect Claude Desktop, Claude Code or Cursor with a Personal key (MCP) to read your invoices and, with Draft permission, create drafts
- 📄 **Invoice editor and PDF** - Totals checked on the server with exact decimals, numbering per sender profile, a PDF made in the browser
- 💾 **Saved data** - Sender profiles with bank accounts, customers, products and custom prices per customer
- 🌍 **Multi-currency** - Invoices in any currency; the dashboard shows each currency apart, never converted
- 📊 **Dashboard** - Revenue, expected payments and debtors for a period
- 📦 **Your data** - Export everything you own, or delete your account
- 🔒 **Security** - Rate-limited sign-in links, refused anonymous actions, a content-security policy and build-time checks for required settings

## 🚀 Quick Start

You need to provide:

- Node.js and [pnpm](https://pnpm.io).
- **Your own empty PostgreSQL database** (local or hosted by you). The app never ships with one.
- The settings listed in [Environment Variables](#-environment-variables), filled in `.env`.

```bash
# Install dependencies
pnpm install

# Create your settings file from the example
cp env.example .env
# Edit .env: set DATABASE_URL to your own empty PostgreSQL database
# (for example postgresql://user:password@localhost:5432/invoiceforge?schema=public)
# and replace the placeholder secrets (see below)

# Apply the database migrations
pnpm prisma migrate deploy

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## 🧪 Testing

```bash
pnpm test
```

`pnpm test` runs the unit, component and contract tests. It does not need a database.

These need a database:

- `pnpm test:integration` - needs PostgreSQL. It starts its own throwaway PostgreSQL container, so Docker must be running (the tests skip cleanly if Docker is absent). It never uses the database in your `.env`.
- `pnpm test:e2e` - browser tests (Playwright; run `pnpm exec playwright install` once). The tests that need a database start their own throwaway PostgreSQL container too, so they need Docker; the rest run without a database. With `CI` set (`CI=1 pnpm test:e2e`, as CI runs it) it runs on two workers and always starts its own servers; without it, Playwright uses half your CPUs and reuses servers already running.

The screenshot tests in `pnpm test:e2e` (editor, landing, AI chat) compare against Linux baselines, so they skip on macOS and Windows (see [tests/e2e/README.md](./tests/e2e/README.md)). The e2e app answers the AI chat from a scripted stub model, so it makes no paid model call.

`pnpm eval:assistant` runs the AI assistant against the real model. It is billed through the AI Gateway, so run it on purpose only; `pnpm eval:assistant:dry` checks the cases without a model call.

See the [testing guide](./tests/README.md) for the layout and how to write tests.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Authentication:** Auth.js (NextAuth.js v5)
- **UI:** Tailwind CSS + Shadcn UI
- **State:** Zustand
- **Validation:** Zod + React Hook Form
- **AI:** Vercel AI SDK through the Vercel AI Gateway (Anthropic Claude Haiku by default), Mastra agents, MCP server (`@modelcontextprotocol/sdk`)
- **Monitoring:** Sentry + Vercel Analytics


## 📁 Project Structure

```
app/              # Next.js App Router pages and route handlers (AI chat, MCP, cron)
components/       # React components
lib/              # Business layer, server actions and utilities
mastra/           # AI agent, tools and observability
prisma/           # Database schema & migrations
config/           # App configuration and routes
constants/        # Page copy and fixed content
hooks/            # React hooks
store/            # Zustand stores
types/            # TypeScript type definitions
scripts/          # Build checks and maintenance scripts
tests/            # Unit, component, integration and e2e tests
evals/            # AI assistant evaluation cases
docs/             # Project docs, feature specs and the changelog (VitePress site)
```

## 🔧 Environment Variables

Copy `env.example` to `.env` and fill in every setting below (`pnpm build` stops and names any that is missing):

- `DATABASE_URL` - connection string of your own PostgreSQL database
- `AUTH_SECRET` - Auth.js secret; generate one with `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - Google OAuth credentials
- `EMAIL_SERVER_HOST` / `EMAIL_SERVER_PORT` / `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD` - SMTP configuration
- `NEXT_PUBLIC_SENTRY_DSN` - public Sentry DSN used by the browser
- `CRON_SECRET` - bearer secret for the purge cron; generate with `openssl rand -base64 32`
- `LIMIT_KEY_SECRET` - HMAC key for sign-in limit keys; generate with `openssl rand -base64 32`
- `AI_GATEWAY_API_KEY` - Vercel AI Gateway key; the AI chat's model calls are billed through it

Optional: `AUTH_URL`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SIGNIN_RESPONSE_FLOOR_MS`, `AI_CHAT_MODEL` (default `anthropic/claude-haiku-5.5`; only another `anthropic/*` model works).

## 📚 Documentation

The `docs/` folder holds the project description, the architecture map, every feature's spec and design, and the [changelog](./docs/changelog.md). Run `pnpm docs:dev` to browse it as a site (VitePress).

## 📝 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

You are free to share and adapt this work for non-commercial purposes with proper attribution. See [LICENSE](./LICENSE) for full details.

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

## 🤝 Contributing

Contributions are welcome! Open an issue or a pull request, and run `pnpm test`, `pnpm lint` and `pnpm exec tsc --noEmit` before you submit.

---

**[invoiceforge.hopko.dev](https://invoiceforge.hopko.dev)** • Built with ❤️ by [Dmytro Hopko](https://github.com/GopkoDev)

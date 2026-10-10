# Invoice Forge

> Modern invoice management system for freelancers and small businesses

[![Live Demo](https://img.shields.io/badge/demo-live-success)](https://invoiceforge.hopko.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org)

## ✨ Features

- 📄 **Professional PDF Generation** - Create beautiful invoices instantly
- 💾 **Smart Data Management** - Pre-save clients, products, and sender profiles
- 🌍 **Multi-Currency Support** - Work with international clients effortlessly
- 📊 **Real-Time Tracking** - Monitor invoice status and payment history
- 🎨 **Modern UI** - Clean, responsive design built with Shadcn UI

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
- `pnpm test:e2e` - browser tests (Playwright; run `pnpm exec playwright install` once). The tests that need a database start their own throwaway PostgreSQL container too, so they need Docker; the rest run without a database.

The two layout screenshot tests in `pnpm test:e2e` compare against Linux baselines, so they skip on macOS and Windows (see [tests/e2e/README.md](./tests/e2e/README.md)).

See the [testing guide](./tests/README.md) for the layout and how to write tests.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Authentication:** Auth.js (NextAuth.js v5)
- **UI:** Tailwind CSS + Shadcn UI
- **State:** Zustand
- **Validation:** Zod + React Hook Form
- **Monitoring:** Sentry + Vercel Analytics


## 📁 Project Structure

```
app/              # Next.js App Router pages
components/       # React components
lib/              # Utility functions & actions
prisma/           # Database schema & migrations
config/           # App configuration
types/            # TypeScript type definitions
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

Optional: `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SIGNIN_RESPONSE_FLOOR_MS`.

## 📝 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

You are free to share and adapt this work for non-commercial purposes with proper attribution. See [LICENSE](./LICENSE) for full details.

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

## 🤝 Contributing

Contributions are welcome! Open an issue or a pull request, and run `pnpm test`, `pnpm lint` and `pnpm exec tsc --noEmit` before you submit.

---

**[invoiceforge.hopko.dev](https://invoiceforge.hopko.dev)** • Built with ❤️ by [Dmytro Hopko](https://github.com/GopkoDev)

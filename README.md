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

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env

# Run database migrations
pnpm prisma migrate dev

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

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

Required environment variables (see `.env.example`):

- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - NextAuth secret key
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` - OAuth credentials
- `EMAIL_SERVER_*` - SMTP configuration
- `SENTRY_DSN` - Error tracking (optional)

## 📝 License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)**.

You are free to share and adapt this work for non-commercial purposes with proper attribution. See [LICENSE](./LICENSE) for full details.

[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

## 🤝 Contributing

Contributions are welcome! See [TODO.md](./TODO.md) for planned features.

---

**[invoiceforge.hopko.dev](https://invoiceforge.hopko.dev)** • Built with ❤️ by [Dmytro Hopko](https://github.com/GopkoDev)

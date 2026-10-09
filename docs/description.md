# Invoice Forge

Invoice Forge is a web application for invoices. Freelancers and small agencies use it. The application keeps the data for each invoice, makes a PDF file and shows who must pay.

The live application is at [invoiceforge.hopko.dev](https://invoiceforge.hopko.dev).

## Users

- **Freelancer.** A person who has an account. A Freelancer owns sender profiles, customers, products and invoices. A Freelancer sees only their own data.
- **Customer.** A party that a Freelancer sends invoices to. A Customer does not sign in.
- **Assistant.** An AI program that reads data for one Freelancer. The Freelancer gives it a Personal key.
- **Visitor.** A person or a program without an account. A Visitor sees only the public pages.

## Functions

### Sign-in

- A Visitor signs in with a Google account or with a sign-in link. The application sends the link by email.
- The first sign-in makes a new account.
- The application limits sign-in links: 5 for each mailbox in one hour.

### Sender profiles

- A sender profile is a business identity. It has legal details, a logo, bank accounts and an invoice prefix.
- A Freelancer can have more than one sender profile.
- Each sender profile has its own invoice sequence.

### Customers, products and prices

- A Freelancer keeps a list of customers and a list of products.
- A product has a standard price.
- A custom price is a price for one product and one customer. The editor uses the custom price for that customer.

### Invoices

- The invoice editor makes and changes invoices. It calculates the totals.
- The server calculates the totals again with exact decimals. A total cannot be less than zero.
- An invoice number is unique in its sender profile. The application gives the next number automatically. The Freelancer can also type a number.
- An invoice has one of these statuses: draft, pending, overdue, paid or cancelled.
- An invoice is overdue when it is not paid and its due date is before today. "Today" is in the Freelancer time zone.
- An invoice keeps a copy of the customer and sender details. A change to a customer does not change old invoices.
- The browser makes the PDF file of the invoice.

### Dashboard

- The dashboard shows revenue, expected payments and debtors for a period.
- The dashboard shows the figures for each currency. It does not convert currencies.
- A custom period can be 5 years or less.

### Assistants (MCP)

- A Freelancer connects an AI assistant on the page **Settings → Assistants**. Claude Desktop, Claude Code and Cursor are examples.
- The Freelancer makes a Personal key for each assistant. The application shows the full key only one time.
- The assistant uses seven read-only tools. It cannot change data.
- The tools use the same rules as the dashboard. Thus, the numbers are the same.
- The Freelancer can stop a key at any time.

### Account and data

- A Freelancer can export all their data. The application limits exports to 3 in one hour.
- A Freelancer can delete the account. This removes all their data.
- A customer or a sender profile that has invoices cannot be deleted alone.

## Security

- The server checks each request. It does not trust the browser.
- Only the public pages are open to a Visitor. All other pages and actions need a verified session.
- Each function reads and writes only the data of the signed-in Freelancer.
- The logo fetch cannot get data from internal or private network addresses.
- The application sends headers that protect the browser (content security policy, HSTS, frame rules).
- Limits protect sign-in, exports and assistant calls from too many requests.

## Structure

The application is one Next.js project. It has these layers:

| Layer | Path | Function |
|---|---|---|
| Pages | `app/` | Pages and route handlers (App Router) |
| Components | `components/` | User interface parts (shadcn/ui and Tailwind CSS) |
| Web actions | `lib/actions/` | Get the Freelancer from the session and call the business layer |
| Business layer | `lib/services/` | All business rules. It does not use a browser session |
| Assistant tools | `lib/mcp/` | MCP tools on the business layer (endpoint `/api/mcp`) |
| Data | `prisma/` | Database schema and migrations (PostgreSQL) |
| Tests | `tests/` | Unit, component, contract, integration and end-to-end tests |

The web actions and the assistant tools use the same business layer. Thus, all callers apply the same rules.

## Technology

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.
- **Database:** PostgreSQL with Prisma 7.
- **Sign-in:** Auth.js 5 (Google and email links).
- **User interface:** shadcn/ui, Tailwind CSS 4, Zustand, React Hook Form, Zod.
- **PDF:** React PDF.
- **Assistants:** Model Context Protocol SDK.
- **Monitoring:** Sentry, Vercel Analytics.
- **Tests:** Vitest, Testing Library, Playwright.
- **Hosting:** Vercel. A daily cron job removes old limit records.

## Run the application on your computer

You must have Node.js 22, pnpm 10 and a PostgreSQL database.

1. Install the dependencies: `pnpm install`.
2. Copy `env.example` to `.env`.
3. Write the values in `.env`. You must set `DATABASE_URL` and `AUTH_SECRET`.
4. Apply the migrations: `pnpm prisma migrate dev`.
5. Start the server: `pnpm dev`.
6. Open `http://localhost:3000`.

## Do the checks

1. Do the unit, component and contract tests: `pnpm test`.
2. Do the integration tests: `pnpm test:integration`. These tests need Docker.
3. Do the end-to-end tests: `pnpm test:e2e`.
4. Do the lint check: `pnpm lint`.

## Documentation

- Each feature has a folder in `docs/features/`. The folder has the spec, the architecture (SAD), the ADRs, the contracts, the tasks and the test plan.
- The [changelog](./changelog.md) shows the shipped features, the work in progress and the planned work.
- The [architecture map](./architecture-map.md) shows the current structure of the code.
- The [docs site](./docs-site.md) page tells how this site works. To start it, use `pnpm docs:dev`.

## License

The license is [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). You can share and change the work. You cannot use it for commercial purposes. You must give attribution.

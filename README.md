# InvoiceFlow

Modern invoice management system built with Next.js, Prisma, and TypeScript.

## Getting Started

First, install dependencies:

```bash
pnpm install
```

Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js
- **UI Components:** Shadcn UI with Tailwind CSS
- **State Management:** Zustand
- **Form Handling:** React Hook Form + Zod

## Roadmap

### 🐛 Bug Fixes

- [ ] Modal height overflow on small screens (custom price editing modal)
- [ ] Contact information should be clickable links on profile page

### ✨ Features

#### High Priority

- [ ] **Onboarding Flow**: Implement first-time user onboarding experience
- [ ] **i18n Support**: Add internationalization for multi-language support
- [ ] **Custom Product Types**: Allow users to define their own product types based on business activity during registration

#### Core Features

- [ ] **Sender Profiles Management**

  - [ ] Implement pagination for sender profiles list
  - [ ] Add drag-and-drop reordering
  - [ ] Soft delete via `isArchived` flag (store `archivedInvoicePrefix` separately)
  - [ ] Add "Back" button on create/edit forms

- [ ] **Product Management**

  - [ ] Add price change history logging
  - [ ] Display custom prices overview on product page
  - [ ] Add product-specific seed data based on user's business type

- [ ] **Rich Text Editor**: Implement Tap Tap editor for notes fields

#### UX Improvements

- [ ] **Loading State Optimization**: Store item count in localStorage to render matching skeleton count
- [ ] **Navigation**: Add back button to all create/edit forms

#### Architecture & Performance

- [ ] **Revalidation Strategy**: Evaluate moving `revalidatePath` calls from actions to call sites
- [ ] **API Layer Refactoring**: Restructure actions to follow API-like patterns with grouped parameters and entity-based organization

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Shadcn UI](https://ui.shadcn.com)

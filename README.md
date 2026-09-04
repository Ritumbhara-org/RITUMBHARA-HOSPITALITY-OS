# Ritumbhara Hospitality OS (V1 Sprint)

Ritumbhara Hospitality OS is a lightweight Hospitality Operations + Guest Engagement platform that sits **ON TOP** of Intellistay PMS.

It connects:
`PMS → Operations → Team → Guest → WhatsApp → Management`

## Tech Stack
- Next.js 14 (App Router) + TypeScript
- PostgreSQL + Prisma ORM
- Tailwind CSS + shadcn/ui
- Zod for validation
- NextAuth.js for auth
- Single monorepo — frontend + API routes together

## Setup Instructions

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   ```
4. Run Prisma migrations to set up the database:
   ```bash
   npx prisma migrate dev --name init
   ```
5. Seed the database with initial mock data:
   ```bash
   npx prisma db seed
   ```
6. Run the development server:
   ```bash
   npm run dev
   ```

## Documentation
- [Architecture](docs/architecture.md)
- [Data Flow](docs/data-flow.md)
- [User Journeys](docs/journeys.md)

## Weekly Milestones
- **Week 1 (Day 1-7)**: V3 Foundation + UI/UX + SEO Automation
- **Week 2**: WhatsApp Integration & Core Workflows (Planned)

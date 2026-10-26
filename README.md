# PayrollHRM — Payroll & HRMS SaaS

A production-style, multi-tenant **Payroll and HRMS platform built for Indian companies**. It covers the full employee lifecycle, payroll processing, statutory compliance (PF, ESI, PT, LWF, TDS), finance, self-service, reporting, and platform administration.

Built with **Next.js 15 (App Router)**, **TypeScript**, **Prisma**, **PostgreSQL**, **NextAuth v5**, **Tailwind CSS**, and **Radix UI**.

---

## Features

### People & organization
- Employee master with personal, bank, and statutory details
- Full lifecycle records: confirmation, promotion, transfer, resignation, exit
- Employee documents and asset assignments
- Org setup: companies, branches, departments, designations, grades, categories, cost centers, business units, locations, shifts, weekly-off rules

### Payroll
- Configurable pay components (earnings/deductions) with formula support
- Salary structures per employee
- Monthly payroll runs: draft → finalized → paid / cancelled
- Attendance-aware processing, adjustments, recalculate
- Payslip generation and printable payslips
- Bank file, run register, and summary exports
- Payroll dashboard and analytics

### Attendance & leave
- Attendance policies, shift masters, rosters, biometric device registry
- Attendance import, punch records, and automatic status evaluation (late, half-day, overtime, etc.)
- Holiday calendars and weekly-off rules
- Leave types, policies, balances, accrual, carry-forward, encashment, and year-end processing
- Leave approval workflows

### India statutory compliance (fully configurable, no hardcoded rates)
- **PF/EPS** — configuration, register, ECR, challan
- **ESI** — configuration, register, return, challan
- **Professional Tax** — state regions and slabs, register, challan
- **LWF** — state config and register
- **Income Tax / TDS** — old and new regime slabs, declarations (80C, 80D, NPS, home loan, HRA, previous employer), annual computation, monthly TDS application, Form 24Q and Form 16
- Compliance dashboard with setup-readiness checks

### Finance
- Reimbursements/claims with approval flow
- Loans and advances with EMI schedules
- Bonus plans and allocations
- Gratuity records
- Full & final settlements

### Employee self-service ("My Workspace")
Profile, attendance, leave, payslips, claims, loans, assets, and tax declarations — scoped to the signed-in employee.

### Reports & admin
- Ad-hoc report builder over HR, payroll, compliance, and leave data
- CSV and Excel export
- Saved and scheduled reports
- Company (tenant) management
- Granular roles and permissions
- Two-factor authentication (TOTP), session revocation, password reset
- Audit logs, database backup/restore, bulk employee upload, email payslip delivery

### APIs
- `/api/v1/*` — web application API
- `/api/mobile/v1/*` — mobile client API (attendance punch, leave, claims, payslips, manager approvals)

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, server actions/routes) |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Prisma 6 |
| Auth | NextAuth v5 (credentials + TOTP 2FA) |
| UI | Tailwind CSS, Radix UI, Lucide icons |
| Validation | Zod + React Hook Form |
| Exports | CSV, Excel-compatible, printable HTML |

---

## Getting started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/payroll_hrms?schema=public"
AUTH_SECRET="<random 32+ byte secret>"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="PayrollHRM"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
UPLOAD_DIR="./storage/uploads"
MAX_UPLOAD_SIZE_MB="10"
```

Generate a secret with `openssl rand -base64 32`.

### 3. Create the schema and seed demo data

```bash
npm run db:push
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

### Demo accounts

Password for all seeded users: `Admin@123`

| Role | Email |
|---|---|
| Platform Super Admin | `superadmin@acme.example` |
| Company Admin | `admin@acme.example` |
| HR | `priya@acme.example` |
| Manager | `ceo@acme.example` |
| Employee | `sde@acme.example` |

> Change these credentials before exposing a real deployment.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Start the production server |
| `npm run lint` | Lint |
| `npm run typecheck` | TypeScript check |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to the database |
| `npm run db:migrate` | Deploy migrations |
| `npm run db:seed` | Seed demo data |

---

## Deploying

### Vercel + hosted PostgreSQL (Neon/Supabase)

1. Create a PostgreSQL database (e.g. [Neon](https://neon.tech)).
2. Import this repository into Vercel.
3. Set the environment variables:
   - `DATABASE_URL` — hosted Postgres connection string (use the pooled URL if available)
   - `AUTH_SECRET` — random secret
   - `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` — your deployment URL
   - `UPLOAD_DIR=/tmp/uploads` (serverless filesystems are ephemeral; use object storage for durable uploads)
4. Push the schema and seed:
   ```bash
   DATABASE_URL="<hosted-url>" npx prisma db push
   DATABASE_URL="<hosted-url>" npm run db:seed
   ```
5. Deploy. `prisma generate` runs automatically via `postinstall`.

### Docker

```bash
docker compose up --build
```

The compose file starts PostgreSQL and the app on port 3000. Run `npx prisma db push` and `npm run db:seed` inside the app container after the first start.

---

## Project structure

```
src/
  app/                 Next.js routes (auth, dashboard, API)
  components/          UI and feature components
  config/              Navigation, setup module definitions
  lib/                 Auth, authorization, Prisma client, validation
  server/
    controllers/       Request handlers
    services/          Business logic (payroll, compliance, leave, finance, ...)
  types/
prisma/
  schema.prisma        Data model
  seed.ts              Demo tenant and data
```

---

## Notes

- Multi-tenancy is enforced at the service layer via `companyId` scoping and role permissions.
- Statutory rates and slabs are configuration, not code — review them for your state and financial year.
- Email delivery and biometric devices are record-keeping integrations; connect a real SMTP provider or device gateway for production use.
- This project is a functional demo/reference implementation. Review security, backups, and compliance requirements before production use.

---

## License

No license has been specified. All rights reserved by the repository owner.

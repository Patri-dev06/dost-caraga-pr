# DOST Caraga - Procurement System

A web-based procurement system designed to streamline the purchase request creation and pre-validation process for DOST Caraga. The system provides a centralized platform for creation, pre-validation, routing, approval, and monitoring of Purchase Requests.

## Tech Stack

### Backend (`pr_backend/`)
- **Framework:** Laravel 13 (PHP 8.3+)
- **Database:** PostgreSQL
- **Testing:** PHPUnit 12

### Frontend (`pr_frontend/`)
- **Framework:** React with TanStack Start
- **Build Tool:** Vite
- **UI Components:** Radix UI + shadcn/ui
- **Styling:** Tailwind CSS
- **Form Handling:** React Hook Form + Zod validation

## Project Structure

```
├── pr_backend/          # Laravel API backend
│   ├── app/
│   ├── config/
│   ├── database/
│   ├── routes/
│   └── ...
├── pr_frontend/         # React frontend
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── routes/
│   └── ...
└── dost_caraga_procurement_system_research_and_design.md
```

## Getting Started

### Prerequisites
- PHP 8.3+
- Composer
- Node.js 22.12+ (the locked TanStack Start version requires this minimum)
- PostgreSQL

### Setup

```bash
npm run setup
```

This installs frontend and backend dependencies, creates the Laravel environment
and local PostgreSQL database, runs migrations, and seeds demo data.

### Run

```bash
npm run dev
```

Open the frontend URL printed by Vite (normally `http://127.0.0.1:5173`). The root
command starts both the Laravel API and frontend; Vite selects the next free port if 5173 is occupied.

Demo login: `admin@dost.gov.ph` / `password123`

## Features (Module 1: Purchase Request Creation and Pre-Validation)

- Purchase Request creation and routing
- Validation against Project Procurement Management Plan (PPMP)
- Line-Item Budget (LIB) checking
- APP-CSE and APP-Non-CSE validation
- Budget balance tracking
- Approval workflow routing

The current code also includes supplier management, Requests for Quotation (RFQ),
Abstracts of Canvas (AOC), Purchase Orders (PO), delivery monitoring, reports,
audit logs, queued email notifications, and scheduled RFQ expiry.

## CI and server deployment

GitHub Actions runs frontend lint, TypeScript checking, a production build, and
the backend tests against an isolated PostgreSQL database on pushes and pull requests.
The workflow does not deploy to a server.

For one-time local SSH key access to the existing server, run
`bash scripts/setup-server-access.sh` in your Mac terminal. The script creates a
dedicated key under `~/.ssh`, adds only its public key to the server account, and
loads it into your existing SSH agent. It does not deploy or restart the app.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the system overview, production requirements,
and the proposed deployment setup through Tailscale. To inspect an existing Linux
server without changing its configuration:

```bash
ssh talinoserver2-ts 'bash -s' < scripts/inspect-server.sh
```

## License

MIT

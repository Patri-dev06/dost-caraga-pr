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
- **Deployment:** Cloudflare Workers

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
- Node.js / Bun
- PostgreSQL

### Backend Setup

```bash
cd pr_backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

### Frontend Setup

```bash
cd pr_frontend
bun install
bun run dev
```

## Features (Module 1: Purchase Request Creation and Pre-Validation)

- Purchase Request creation and routing
- Validation against Project Procurement Management Plan (PPMP)
- Line-Item Budget (LIB) checking
- APP-CSE and APP-Non-CSE validation
- Budget balance tracking
- Approval workflow routing

## License

MIT

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
- Node.js 20+
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

## License

MIT

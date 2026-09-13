# PanelScan — Architectural Wall & Ceiling Panel E-Commerce Platform

PanelScan is an e-commerce and project planning platform for architectural wall and ceiling panels for **Disenyo Interior Solution**.

## Architectural Overview

The repository consists of three distinct components:

```text
PanelScan/
├── web/              # Website Frontend: Vite + React 19 + TypeScript + Tailwind CSS
├── backend/          # Website Backend: Node.js + Express + Prisma + CockroachDB
└── frontend/         # Mobile Application: Native / Expo application with AR / 3D measurement
```

### Component Distinctions

1. **Website Frontend (`web/`)**:
   - Modern Vite + React single-page application.
   - Clean customer storefront, customer dashboard, support messaging, and responsive order flow.
   - Owner and Moderator administration workspaces for stock control, team management, sales reporting, and change request governance.
   - Directly integrated with the real PanelScan Backend API (`VITE_API_BASE_URL`).

2. **Website Backend (`backend/`)**:
   - Production-ready Express + TypeScript + Prisma ORM backend connected to CockroachDB Cloud.
   - Handles real persistent business data: customer accounts, secure authentication, session management, catalog, inventory, order processing, installer scheduling, customer support chat, reviews, and change requests.
   - Enforces strict server-side Role-Based Access Control (`OWNER`, `MODERATOR`, `CUSTOMER`).

3. **Android Application & AR/3D (`frontend/`)**:
   - Specialized native mobile experience utilizing local device sensors, camera, ARCore, Filament, SceneView, and local database storage.
   - Operates independently from the website backend to maintain low-latency local AR frame processing and corner detection without unnecessary network overhead.

---

## Key Business Rules & Authorization

- **Price Visibility**:
  - **Logged-out customers** cannot access product pricing. Unauthenticated API requests return `price: null` and the storefront displays `"Sign in to view pricing"`.
  - **Logged-in customers** receive real prices formatted in Philippine Peso (₱).
- **Staff Roles & Governance**:
  - **Owner/Admin (`OWNER`)**: Full operational authority, moderator provisioning, user restriction, and change request approval/rejection.
  - **Moderator (`MODERATOR`)**: Operational access (product creation, inventory management, order fulfillment, installers, and customer support). Cannot provision other moderators (enforced with `403 Forbidden`) and cannot approve their own change requests.
  - **Customer (`CUSTOMER`)**: Public catalog browsing, authenticated price viewing, cart and order checkout, private project management, customer reviews, and support chat.
- **Product Creation & Inventory Sync**:
  - Products created by moderators or owners are saved with SKU, dimensions, unit, material, and price.
  - An `Inventory` record is created atomically within a database transaction, immediately tracking on-hand stock and reorder thresholds.
  - Uploaded product imagery is persisted via `POST /api/upload` to disk storage and statically served.
- **Support Chat & Privacy**:
  - Customers can only view and message within their own conversations (IDOR protected).
  - Moderators and Owners can respond to any customer support thread.

---

## Getting Started

### Backend Setup

```bash
cd backend
npm install
npm run prisma:generate
# Configure your .env file with DATABASE_URL and JWT_SECRET
npm run dev
```

### Web Frontend Setup

```bash
cd web
npm install
# Configure your .env file with VITE_API_BASE_URL=http://localhost:4000/api
npm run dev
```

---

## Testing & Verification

The project includes an end-to-end integration and RBAC test suite validating all 35 production rules:

```bash
node scratch/verify_system.mjs
```

### Build & Typecheck

```bash
# Typecheck
cd backend && npm run typecheck
cd ../web && npm run typecheck

# Production Build
cd ../backend && npm run build
cd ../web && npm run build
```

---

## License

Proprietary — Copyright (c) Disenyo Interior Solution. All rights reserved. Refer to `LICENSE` for details.

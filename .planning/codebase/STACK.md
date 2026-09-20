# Technology Stack

**Analysis Date:** 2026-09-20

## Languages

**Primary:**
- TypeScript 5.6.3 - Backend (API), admin tooling, and iOS app

**Secondary:**
- SQL - PostgreSQL database schema (`api/src/db/schema.ts`)
- YAML - Docker Compose configuration (`infra/docker-compose.yml`)

## Runtime

**Environment:**
- Node.js 22 (backend API)
- Planned: Expo (React Native) runtime for iOS app
- Planned: Node.js (Next.js) for admin web interface

**Package Manager:**
- npm 10+ (inferred from Node.js 22)
- Lockfile: `api/package-lock.json` present

## Frameworks

**Core (Backend):**
- Fastify 5.1.0 - HTTP server framework (`api/src/server.ts`)
- Drizzle ORM 0.36.4 - Type-safe database layer (`api/src/db/schema.ts`)

**Planned:**
- Next.js (TypeScript, static export) - Admin pack authoring and master DB interface (`admin/` — not yet scaffolded)
- Expo (React Native + TypeScript) - iOS/iPadOS client with Expo Router for navigation (`app/` — not yet scaffolded)

**Utilities:**
- Zod 3.23.8 - Runtime schema validation (imported in dependencies, used for request/response validation)
- dotenv 16.4.5 - Environment variable loading

**Database Access:**
- postgres 3.4.5 - Native PostgreSQL client (used by Drizzle ORM)

**Development:**
- tsx 4.19.2 - TypeScript execution and hot-reload (`npm run dev`)
- drizzle-kit 0.28.1 - Database migrations and schema generation (`db:generate`, `db:migrate`, `db:studio`)

## Key Dependencies

**Critical:**
- `fastify` 5.1.0 - Core API runtime; serves auth, catalog, purchase verification, pack delivery, webhook endpoints
- `drizzle-orm` 0.36.4 - Type-safe ORM; manages all database interactions (users, packs, POIs, entitlements, imports, feedback)
- `postgres` 3.4.5 - PostgreSQL driver; required for Drizzle to connect to the database

**Infrastructure:**
- `zod` 3.23.8 - Schema validation; recommended for API request/response validation and data integrity
- `dotenv` 16.4.5 - Environment variable management; loads `DATABASE_URL`, API keys, secrets from `.env`

## Configuration

**Environment:**
- Configuration method: `.env` file (referenced in `api/drizzle.config.ts` and Dockerfile)
- `.env.example` present at `api/.env.example` documenting required variables
- Critical configs:
  - `DATABASE_URL` - PostgreSQL connection string (format: `postgres://user:password@host:port/database`)
  - `PORT` - API server port (default: 3003)
  - `HOST` - API server bind address (default: 0.0.0.0)
  - Additional secrets (not read): Apple App Store Server API key (`.p8` file), Sign in with Apple credentials, JWT signing secret, Smarty API key

**Build:**
- TypeScript compiler configuration: `api/tsconfig.json`
  - Target: ES2022
  - Module system: NodeNext (ESM)
  - Strict mode enabled
  - Output directory: `api/dist`
- Drizzle configuration: `api/drizzle.config.ts`
  - Schema location: `api/src/db/schema.ts`
  - Migration output: `api/drizzle/`
  - Database dialect: PostgreSQL

## Platform Requirements

**Development:**
- Node.js 22+
- PostgreSQL 16 (runs in Docker via `docker-compose`)
- Docker and Docker Compose
- npm or compatible package manager

**Production:**
- Deployment target: Ubuntu 24.04 VPS (rycsprojects)
- Containerization: Docker
  - Base image: `node:22-alpine` (multi-stage build in `api/Dockerfile`)
  - Two-stage build: compile TypeScript in first stage, copy only production dependencies and compiled JS to final image
  - API container: `wowm-api`, binds to `127.0.0.1:3003`
  - DB container: `wowm-db` (PostgreSQL 16), internal network only, persistent volume `wowm_db_data`
- Reverse proxy: nginx (handles TLS via certbot, rate limiting, security headers)
- Secrets management: `.env` file in `wowm/infra/` (not committed; managed separately on VPS)

## Build & Run Commands

```bash
# Development
npm run dev              # Start API with hot-reload (uses tsx)
npm run typecheck       # Type-check without compilation
npm run build           # Compile TypeScript to dist/
npm run start           # Run compiled API (production-like)

# Database
npm run db:generate     # Generate migration files from schema changes
npm run db:migrate      # Apply migrations to database
npm run db:studio       # Open Drizzle Studio UI for database inspection

# Local Docker environment
docker-compose up       # Start wowm-db and wowm-api
```

---

*Stack analysis: 2026-09-20*

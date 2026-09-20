# Phase 1: Admin Pack Authoring & Build - Pattern Map

**Mapped:** 2026-09-20  
**Files analyzed:** 16  
**Analogs found:** 9 / 16 (backend files have analogs; entire admin/ app has no project analog — follows spec-defined stack)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `api/src/middleware/adminAuth.ts` | middleware | request-response | `api/src/server.ts` (preHandler pattern) | partial |
| `api/src/routes/admin/packs.ts` | controller | CRUD | `api/src/db/schema.ts` (Drizzle usage) | role-match |
| `api/src/routes/admin/fields.ts` | controller | CRUD | `api/src/db/schema.ts` (Drizzle usage) | role-match |
| `api/src/routes/admin/filters.ts` | controller | CRUD | `api/src/db/schema.ts` (Drizzle usage) | role-match |
| `api/src/routes/admin/pois.ts` | controller | CRUD + special (geocode) | `api/src/db/schema.ts` (Drizzle usage) | role-match |
| `api/src/routes/admin/build.ts` | controller | request-response | `api/src/server.ts` (Fastify handler) | role-match |
| `api/src/services/geocoding.ts` | service | request-response | none — new service pattern | no-analog |
| `api/src/utils/errors.ts` | utility | error-handling | none — spec-defined | no-analog |
| `api/src/server.ts` (update) | integration | request-response | existing code | existing |
| `admin/package.json` | config | config | `api/package.json` | role-match |
| `admin/app/layout.tsx` | component/layout | request-response | none — new app | no-analog |
| `admin/app/page.tsx` | component/page | request-response | none — new app | no-analog |
| `admin/app/packs/page.tsx` | component/page | CRUD (list) | none — new app | no-analog |
| `admin/app/packs/[id]/page.tsx` | component/page | CRUD (detail/update) | none — new app | no-analog |
| `admin/app/packs/[id]/pois/page.tsx` | component/page | CRUD (list/create) | none — new app | no-analog |
| `admin/lib/api.ts` | utility/service | request-response | none — new app | no-analog |

---

## Pattern Assignments

### API Backend Patterns

#### `api/src/server.ts` — Fastify Application Setup

**Analog source:** `api/src/server.ts` (existing)

**Import pattern** (lines 1–3):
```typescript
import 'dotenv/config';
import Fastify from 'fastify';
```

**Fastify app instantiation pattern** (lines 4–4):
```typescript
const app = Fastify({ logger: true });
```

**Handler/route registration pattern** (lines 6–6):
```typescript
app.get('/healthz', async () => ({ status: 'ok' }));
```

**Server startup pattern** (lines 11–16):
```typescript
app
  .listen({ port, host })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
```

**How to use for admin routes:**  
Register admin routes via new `FastifyInstance.register()` calls or per-route `preHandler` middleware (Fastify's equivalent of Express middleware). Example pattern:
```typescript
app.register(async (fastify) => {
  fastify.addHook('preHandler', adminAuthMiddleware);
  // admin routes here
});
```

---

#### `api/src/db/schema.ts` — Drizzle ORM Pattern

**Analog source:** `api/src/db/schema.ts` (existing, lines 1–43 show pattern)

**Imports** (lines 1–4):
```typescript
import {
  pgTable, uuid, text, char, boolean, integer,
  jsonb, timestamp, doublePrecision, unique, primaryKey, index,
} from 'drizzle-orm/pg-core';
```

**Table definition pattern** (lines 21–35):
```typescript
export const packs = pgTable('packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  packType: text('pack_type', { enum: ['standard', 'state'] }).notNull(),
  status: text('status', { enum: ['draft', 'published', 'deprecated'] }).notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Constraint pattern** (lines 37–48 example from packFieldDefinitions):
```typescript
export const packFieldDefinitions = pgTable('pack_field_definitions', {
  // ... columns
}, (t) => ({
  uniq: unique().on(t.packId, t.fieldKey),
}));
```

**How to use for route handlers:**  
- All route handlers will use `SELECT`, `INSERT`, `UPDATE` via Drizzle ORM
- Leverage the existing schema tables (`packs`, `packFieldDefinitions`, `packFilterDefinitions`, `pois`, `packPois`, `packVersions`)
- Follow camelCase JS variable names from schema exports (e.g., `packs.slug`, `packs.currentVersion`)

---

### Admin Route Handler Pattern

**Analog source:** `api/src/server.ts` (Fastify handler pattern)

**Expected structure for `api/src/routes/admin/packs.ts`:**
```typescript
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { packs, packFieldDefinitions, packFilterDefinitions } from '../../db/schema';

// Zod schemas for request validation
const CreatePackSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  packType: z.enum(['standard', 'state']),
  poiTypeId: z.string().uuid().optional(),
  stateCode: z.string().length(2).optional(),
  appleProductId: z.string(),
  priceTier: z.string().optional(),
});

// Handler functions
export async function createPack(req: FastifyRequest, reply: FastifyReply) {
  try {
    const validated = CreatePackSchema.parse(req.body);
    // INSERT into packs table
    // return 201 with created pack
  } catch (err) {
    // Error handling
  }
}

// Register with Fastify
export async function registerPackRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/admin/packs', createPack);
  fastify.put('/v1/admin/packs/:id', updatePack);
}
```

**Key patterns:**
- Use `Zod` (already declared dependency) for request validation at the handler entry point
- Use Drizzle ORM's type-safe query builder (db.select, db.insert, etc.) for all database operations
- Wrap handlers in try/catch; delegate error handling to a central error utility
- Use Fastify's `FastifyRequest` and `FastifyReply` types for full type safety
- Return standard JSON responses with appropriate HTTP status codes (201 for created, 200 for success, 400 for validation, etc.)

---

### Admin Authentication Middleware

**Analog source:** `api/src/server.ts` (Fastify app structure pattern)

**Expected pattern for `api/src/middleware/adminAuth.ts`:**

Per Decision D-01 (01-CONTEXT.md):
- Single bearer token stored in `ADMIN_API_TOKEN` env var
- Fastify `preHandler` hook checks `Authorization: Bearer <token>` header
- Applied to all `/v1/admin/*` routes

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function adminAuthMiddleware(
  fastify: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply
) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  
  const token = authHeader.slice(7); // Remove 'Bearer '
  if (token !== expectedToken) {
    return reply.status(403).send({ error: 'Forbidden' });
  }
}
```

**How to apply:**  
Register via `fastify.addHook('preHandler', adminAuthMiddleware)` within an admin-routes plugin, or per-route basis.

---

### Geocoding Service (New, No Analog)

**File:** `api/src/services/geocoding.ts`

**Pattern guidance from spec §17:**
- Thin adapter wrapping Smarty API
- Takes an address (street, city, state, zip) and returns geocoding result
- Returns standardized response: `{ latitude, longitude, confidence, status, candidates? }`
- Status enum: `ok`, `failed`, `low_confidence`, `address_ambiguous`
- Caches results (implied by spec: "Smarty permits permanent storage")
- Handles provider errors gracefully

**Expected structure:**
```typescript
import { z } from 'zod';

export interface GeocodingResult {
  latitude: number;
  longitude: number;
  confidence: number; // 0-1
  status: 'ok' | 'failed' | 'low_confidence' | 'address_ambiguous';
  candidates?: Array<{ address: string; latitude: number; longitude: number }>;
}

export async function geocodeAddress(
  street: string,
  city: string,
  state: string,
  zip: string
): Promise<GeocodingResult> {
  // Call Smarty API via fetch or axios
  // Map Smarty response to GeocodingResult
}
```

---

### Error Utility (New, No Analog)

**File:** `api/src/utils/errors.ts`

**Pattern guidance from spec §15 (Error Taxonomy):**
- Define standard error codes for geocoding failures: `ADDRESS_NOT_FOUND`, `ADDRESS_AMBIGUOUS`, `LOW_CONFIDENCE_MATCH`, `PROVIDER_ERROR`
- All handlers should return consistent error shapes: `{ error: string, code?: string }`

**Expected structure:**
```typescript
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const GeocodingErrors = {
  ADDRESS_NOT_FOUND: new AppError(400, 'ADDRESS_NOT_FOUND', 'Address not found'),
  ADDRESS_AMBIGUOUS: new AppError(400, 'ADDRESS_AMBIGUOUS', 'Address ambiguous'),
  LOW_CONFIDENCE_MATCH: new AppError(400, 'LOW_CONFIDENCE_MATCH', 'Low confidence match'),
  PROVIDER_ERROR: new AppError(500, 'PROVIDER_ERROR', 'Geocoding provider error'),
};
```

---

## Admin Frontend (`admin/`) — No Project Analogs

**Context:**  
The entire `admin/` Next.js app will be scaffolded during Phase 1 execution via `create-next-app`, then shadcn/ui initialized. No existing code in the project to pattern-match against.

**Pattern source:** Specification §2 (Technology Stack section, "Web Interface") and 01-UI-SPEC.md

### Scaffold & Config Files

**File:** `admin/package.json`  
**Analog:** `api/package.json`

**Differences from API package.json:**
- Framework: Next.js (not Fastify)
- Build system: Next.js built-in (not tsx + tsc)
- UI: shadcn/ui + Tailwind CSS (new dependencies)
- State: TanStack Query (not used in API yet)

**Expected structure:**
```json
{
  "name": "wowm-admin",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^15.x",
    "react": "^19.x",
    "react-dom": "^19.x",
    "typescript": "^5.x",
    "zod": "^3.23.8",
    "@tanstack/react-query": "^5.x",
    "tailwindcss": "^3.x"
  }
}
```

---

### Layout & Page Structure

**Pattern source:** Next.js App Router convention (no project analog)

**File:** `admin/app/layout.tsx`  
**Pattern:**
```typescript
import type { Metadata } from 'next';
import { Geist_Sans } from 'next/font/google';
import './globals.css';

const geist = Geist_Sans({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: "What's On My Way - Admin",
  description: 'Pack authoring and management',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
```

---

### API Client Pattern

**File:** `admin/lib/api.ts`  
**Pattern guidance:**
- Centralized async fetch wrapper for all backend calls
- Sends `Authorization: Bearer <token>` on every request (token stored client-side post-login)
- Error handling: parse JSON response, throw on non-2xx status

**Expected structure:**
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' 
    ? localStorage.getItem('adminToken')
    : null;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API request failed');
  }

  return response.json();
}

export const packApi = {
  list: () => apiCall('/v1/admin/packs'),
  create: (data) => apiCall('/v1/admin/packs', { method: 'POST', body: JSON.stringify(data) }),
  // ... more methods
};
```

---

### Form & Validation Pattern

**Pattern source:** Spec §2 (shadcn/ui + React Hook Form + Zod)

**Expected use in pages/components:**
```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const CreatePackSchema = z.object({
  name: z.string().min(1, 'Pack name required'),
  appleProductId: z.string().min(1),
});

type CreatePackForm = z.infer<typeof CreatePackSchema>;

export function CreatePackForm() {
  const form = useForm<CreatePackForm>({
    resolver: zodResolver(CreatePackSchema),
  });

  async function onSubmit(data: CreatePackForm) {
    // await packApi.create(data);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Input {...form.register('name')} placeholder="Pack name" />
      <Button type="submit">Create Pack</Button>
    </form>
  );
}
```

---

## Shared Patterns

### Zod Usage Across Codebase

**Declared dependency:** `zod@^3.23.8` (both API and admin)

**Backend usage:**
- Route handlers validate request bodies with Zod schemas before processing
- Return 400 + validation error details if parsing fails

**Frontend usage:**
- React Hook Form + Zod for form validation
- Mirrors backend schemas (single source of shared validation logic per spec decision)

---

### TypeScript Conventions

**Across both API and admin:**
- `import type { ... }` for type-only imports (no runtime cost)
- Strict mode enabled (`tsconfig.json`)
- Full type coverage on handler functions, props, and API responses

---

## No Analog Found

Files requiring spec-based patterns (not derived from existing project code):

| File | Role | Reason |
|------|------|--------|
| `api/src/services/geocoding.ts` | service | New service type; only integration point defined in spec §17 |
| `api/src/utils/errors.ts` | utility | Error codes defined in spec §15; no legacy error handling in codebase yet |
| `admin/` (entire app) | multiple | App scaffolded fresh from `create-next-app`; spec-defined stack (shadcn/ui, TanStack Query) |
| `admin/lib/auth.ts` | utility | Admin auth via localStorage token; not a codebase pattern yet |

---

## Metadata

**Analog search scope:**  
- `api/src/` — only 2 tracked source files exist (server.ts, schema.ts)
- `admin/` — does not exist yet (scaffolded during Phase 1)
- `app/`, `infra/` — out of scope for Phase 1

**Files scanned:** 2 (server.ts, schema.ts) in api/src/  
**Tracked source status:** All named analogs verified via `git ls-files`

**Pattern extraction date:** 2026-09-20  
**Phase:** 1 - Admin Pack Authoring & Build

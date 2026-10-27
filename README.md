# AI Detective — Backend

The API for AI Detective, a story-driven web app that teaches learners to build
an AI agent by writing small pieces of code inside a detective narrative.
Learners sign in with an emailed one-time code, work through chapters, story
screens and quizzes, and can ask Mentor Saral, an in-app AI mentor, for hints.

The frontend is a separate repository (React, Vite, TypeScript). In production
both are served from one domain: the site at `/`, this API at `/api`.

## Stack

| Layer    | Technology                                   |
| -------- | -------------------------------------------- |
| Runtime  | Node.js 24+, Express 5, TypeScript (strict)  |
| Database | PostgreSQL 18 via Prisma                     |
| Auth     | Better Auth — email OTP and bearer plugins   |
| Email    | Brevo                                        |
| AI       | LLM provider with streaming replies          |
| Hosting  | Single Google Cloud VM, Mumbai, behind nginx |

Express, Prisma and Better Auth are installed, the full database schema is
migrated, and email one-time-code sign-in works end to end.

## Running locally from a fresh clone

### 1. Node

The project needs Node 24 or later. `.nvmrc` pins the exact version, so every
machine runs the same one:

```bash
nvm install   # first time only — installs the version in .nvmrc
nvm use
```

`.npmrc` sets `engine-strict=true`, so `npm install` on Node 22 or earlier
fails with an engine error instead of installing silently.

### 2. Dependencies

```bash
npm install
```

`npm install` also runs `prisma generate`, which writes the typed database
client to `src/generated/prisma` (gitignored).

### 3. Environment

```bash
cp .env.example .env
```

Fill in the values you need. `.env` is gitignored, so never commit it. To start
the server you need at least `NODE_ENV=development`, `PORT=3000`,
`LOG_DIR=logs` and `CORS_ORIGINS=http://localhost:5173` (the Vite dev server).
If a required variable is missing or malformed, the server refuses to start
and names it. Leave
`EMAIL_MODE` unset or set it to `console` locally. That prints emails to the
terminal instead of sending them, because the Brevo daily limit is shared with
production.

### 4. Database

You need PostgreSQL 18. Either install it locally (for example
`brew install postgresql@18`) or run it in Docker:

```bash
docker run --name ai-detective-db \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=<choose-one> \
  -e POSTGRES_DB=ai_detective \
  -p 5432:5432 -d postgres:18
```

Any PostgreSQL 18 works, including Postgres.app. If another PostgreSQL version
already uses port 5432, run 18 on a different port and put that port in
`DATABASE_URL`. Then apply the schema:

```bash
npm run db:migrate    # prisma migrate dev
npm run db:studio     # browse the tables
```

`BETTER_AUTH_SECRET` must be at least 32 characters, for example from
`openssl rand -base64 32`. `BETTER_AUTH_URL` is the API's own base URL,
`http://localhost:3000` locally.

### Email and sign-in codes

`EMAIL_MODE` decides whether email leaves the machine. Only the exact value
`live` sends through Brevo. Unset, empty or anything else means `console`: the
email, sign-in code included, is printed in the terminal running the server
(never in production, and never in the log file). Leave it unset locally. The
Brevo daily limit is shared with production, and `BREVO_DAILY_CAP` stops
sending past it.

To sign in from the command line, follow `requests.http`: request a code, copy
it from the terminal, verify it, and use the returned bearer token.

### 5. Start the server

```bash
npm run dev
curl http://localhost:3000/api/health
```

`npm run dev` runs the TypeScript sources directly on Node and restarts when a
file changes. Logs go to `LOG_DIR` as JSON lines and, outside production, to
the terminal as well.

### 6. Check the setup

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format      # Prettier, writes changes
npm run format:check
npm run build       # compile to dist/
```

## Scripts

| Script                 | What it does                                         |
| ---------------------- | ---------------------------------------------------- |
| `npm run dev`          | Start the server, restart on change                  |
| `npm run build`        | Compile TypeScript to `dist/`                        |
| `npm start`            | Run the compiled server from `dist/`                 |
| `npm run db:migrate`   | Create and apply migrations (dev)                    |
| `npm run db:studio`    | Open Prisma Studio                                   |
| `npm run seed`         | Recreate the two test learners (never in production) |
| `npm test`             | Run the one-time code rule tests                     |
| `npm run typecheck`    | Type-check without emitting                          |
| `npm run lint`         | Lint with ESLint (type-aware)                        |
| `npm run lint:fix`     | Lint and apply automatic fixes                       |
| `npm run format`       | Format every file with Prettier                      |
| `npm run format:check` | Report files Prettier would change                   |

## Test data and tests

`npm run seed` creates two learners with known emails and completed profiles:

| Email                      | Detective      | Progress                                 |
| -------------------------- | -------------- | ---------------------------------------- |
| `learner.one@example.test` | Detective Asha | Mission 1 (`search-agent`), at chapter 5 |
| `learner.two@example.test` | Detective Ravi | None                                     |

It is safe to run repeatedly: it deletes those two learners (and everything
that cascades from them) and recreates them, and never touches anyone else.
It refuses to run when `NODE_ENV` is `production`.

`npm test` runs the one-time code rules with Node's built-in test runner:
expiry after 10 minutes, single use, locking after 5 wrong attempts, and a new
code replacing the old one. The clock is mocked, so the suite takes about a
second. The test setup forces `EMAIL_MODE=console` and disables network
access, whatever `.env` says. Tests use the database in `DATABASE_URL` and
remove what they create.

`requests.http` walks the API in learner-journey order with the VS Code REST
Client extension; the bearer token is captured from the verify response.

## Code layout

| Folder           | Holds                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/app`        | Express app assembly and the server with graceful shutdown                                                                                                                                       |
| `src/routes`     | Thin route handlers: validate, call a service, return                                                                                                                                            |
| `src/services`   | Business logic, one file per area                                                                                                                                                                |
| `src/db`         | Database access, one file per area, and the shared Prisma client                                                                                                                                 |
| `src/middleware` | Request id and logging, validation, rate limiting, errors                                                                                                                                        |
| `src/lib`        | Config, logger, the `AppError` class, Better Auth setup, and infrastructure: content and Saral prompt loading, email (Brevo transport and templates), Google Sheet sync, tracing, IST formatting |
| `prisma`         | Schema and migrations                                                                                                                                                                            |

Every error response has the same shape, and its `requestId` matches the
`X-Request-Id` header and the log line for that request:

```json
{ "status": 400, "code": "INVALID_INPUT", "message": "...", "requestId": "..." }
```

Logs rotate at 10 MB and the ten most recent files are kept.

## Documentation

- `CLAUDE.md` — the project guide: non-negotiables, conventions, security rules
- `docs/architecture.md` — system design, data model, endpoint list
- `tasks/` — numbered task files, starting at 201. Each one has a goal, scope,
  acceptance criteria and constraints.
- `requests.http` — one request per endpoint, in learner-journey order

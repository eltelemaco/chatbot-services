# Corner Cuts Chatbots

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Two little appointment-booking chatbots, one for a barber shop and one for a restaurant, living side by side in the same npm workspaces monorepo. Each one has its own backend and its own landing page, but they share a common LLM/DB/logging layer so neither has to reinvent the other's wheels.

Each service pairs an Express backend (SQLite via sql.js) with a static landing page (served by nginx), and both sit behind a shared Caddy reverse proxy.

## Monorepo layout

```text
chatbot/
├── caddy/Caddyfile              # Reverse proxy + TLS for both domains
├── docker-compose.yml           # Production-style service definitions
├── docker-compose.override.yml  # Local dev port mappings
├── package.json                 # npm workspaces root
├── scripts/                     # Deploy/ops automation (private, not included)
├── .env.example                 # Template for domain + registry config
├── secrets.conf                 # Real secrets (ignored by git)
├── secrets.example.conf         # Template for required secrets
├── services/
│   ├── barber/
│   │   ├── backend/             # Express API on :3001
│   │   └── landing/             # Static site on :80
│   └── restaurant/
│       ├── backend/             # Express API on :3002
│       └── landing/             # Static site on :80
└── shared/                      # `@chatbot/shared` workspace
    ├── db/                      # SQLite helpers
    ├── llm/                     # OpenRouter/OpenAI-compatible LLM client
    └── logging/                 # Shared logging utilities
```

## Before you start

You'll need:

- Docker + Docker Compose
- Node.js 18+ (only if you want to run a backend outside Docker)
- An `OPENROUTER_API_KEY`, either exported in your shell or dropped into `secrets.conf`

Copy the secrets template and fill it in:

```bash
cp secrets.example.conf secrets.conf
# edit secrets.conf
```

`secrets.conf` is gitignored, so nothing you put there ever gets committed.

## Pointing it at your own domains (`.env`)

Domain names and the container registry namespace live in a root `.env` file, which Compose picks up automatically. Same idea as `secrets.conf` above: copy the template, fill in your own values.

```bash
cp .env.example .env
# edit .env
```

| Variable | Controls |
|----------|----------|
| `BARBER_DOMAIN` | Public hostname for the barber service: its CORS allow-list, its Caddy site block, and the `HTTP-Referer` header sent to the LLM provider |
| `RESTAURANT_DOMAIN` | Same three things, for the restaurant service |
| `DOCKERHUB_REPO` | Docker Hub namespace the four service images are built, pushed, and pulled under |

Everything has a safe `example.com`-style default already baked into `docker-compose.yml`, so `docker compose config` and `docker compose up` both just work with zero setup. `.env` only matters once you want to point the stack at domains you actually own.

One gotcha if you ever run Caddy **outside** Compose: the Caddyfile uses Caddy's `{$BARBER_DOMAIN}` / `{$RESTAURANT_DOMAIN}` placeholders, which (unlike Compose's `${VAR:-default}`) have no built-in fallback. Leave those unset and Caddy will refuse to start. Running through `docker compose up` sidesteps this entirely, since Compose supplies the defaults itself.

## Required secrets

`secrets.conf` in the repo root needs:

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API access |
| `ADMIN_KEY` | Admin endpoints such as `/api/appointments` debug listing |

## Running it locally (Docker Compose)

From the repo root:

```bash
docker compose up --build
```

- Barber UI: http://localhost:8080
- Barber API health: http://localhost:3001/api/health
- Restaurant UI: http://localhost:8081
- Restaurant API health: http://localhost:3002/api/health

Compose picks up `docker-compose.override.yml` automatically, so you get local port mappings for free while the production config stays `expose`-only.

## Local dev without Docker

```bash
# terminal 1: barber backend
cd services/barber/backend
npm install
OPENROUTER_API_KEY=... npm run dev

# terminal 2: restaurant backend
cd services/restaurant/backend
npm install
OPENROUTER_API_KEY=... npm run dev

# terminal 3: open services/barber/landing/index.html
# and services/restaurant/landing/index.html
```

Or use the root-level shortcuts:

```bash
npm run dev:barber     # workspace dev for barber backend
npm run dev:restaurant # workspace dev for restaurant backend
```

## Deploying this yourself

Heads up: the deploy/ops automation that lives under `scripts/` on the maintainer's machine isn't part of this repo. It's wired to one specific host, SSH key, log-shipping pipeline, and alerting setup, none of which would do you any good, so it's excluded via `.gitignore` rather than shipped and left to rot.

If you're taking this further, you'll want your own deploy process for your own target, but everything it needs is already here: `docker-compose.yml` defines the four services plus Caddy, `.env` supplies your domains and registry namespace, and `secrets.conf` supplies the runtime secrets. At its simplest, a deploy is just "get the repo, `.env`, and `secrets.conf` onto the host, then `docker compose up -d`", whether you get there via rsync and SSH, a CI pipeline, or pulling images from your own `DOCKERHUB_REPO` namespace is entirely up to you.

Two things worth remembering when you build that out: create the bind-mounted log directories (`logs/caddy/`, `logs/barber-backend/`, `logs/restaurant-backend/`) before the first `up`, and deploy services selectively (e.g. `docker compose up -d restaurant-backend restaurant-landing`) so rolling out one doesn't unnecessarily recreate the other.

## Service names

Compose service names are domain-prefixed so they don't collide:

| Service | Compose name | Build context |
|---------|--------------|---------------|
| Barber backend | `barber-backend` | `services/barber/backend` |
| Barber landing | `barber-landing` | `services/barber/landing` |
| Restaurant backend | `restaurant-backend` | `services/restaurant/backend` |
| Restaurant landing | `restaurant-landing` | `services/restaurant/landing` |
| Reverse proxy | `caddy` | public `caddy:2-alpine` image |

## Handy day-to-day commands

```bash
# Tail barber backend logs
docker compose logs -f barber-backend

# Tail restaurant backend logs
docker compose logs -f restaurant-backend

# Restart only Caddy after a config change
docker compose up -d --no-deps caddy
```

## Env vars (Compose)

| Variable | Default | Notes |
|----------|---------|--------|
| `OPENROUTER_API_KEY` | from `secrets.conf` | Required |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible endpoint |
| `OPENROUTER_MODEL` | `amazon/nova-lite-v1` | |
| `DATABASE_PATH` | `/data/appointments.db` or `/data/reservations.db` | Named volume per service |
| `SHOP_TZ` | `America/Mexico_City` | |
| `LLM_MAX_TOKENS` | `8000` | Keep high enough for tool calls |
| `ALLOWED_ORIGINS` | `https://<service>.example.com` | CORS allow-list; derived from `BARBER_DOMAIN` / `RESTAURANT_DOMAIN` |
| `PUBLIC_DOMAIN` | `<service>.example.com` | Bare hostname sent as `HTTP-Referer` to the LLM provider; same source |
| `SERVICE_NAME` | `barber` / `restaurant` | Used by shared code and labels |
| `APP_LOG_PATH` | `/app/logs/app.log` | Bind-mounted log directory |

`BARBER_DOMAIN`, `RESTAURANT_DOMAIN`, and `DOCKERHUB_REPO` live in `.env` rather than per-container. See [Pointing it at your own domains](#pointing-it-at-your-own-domains-env).

## A few things worth knowing

- Persistence uses SQLite via **sql.js**, pure JS/WASM, so there's no native build step to fight with.
- Both backends use OpenAI-style **tool calling** for availability and booking, and each enforces its own business rules to keep double-bookings from ever happening: the model proposes, the backend disposes.
- `shared/` is a proper npm workspace package (`@chatbot/shared`), so both services draw from the same LLM client, DB helpers, and logging instead of copy-pasting them.
- Logs are bind-mounted under `./logs/<service>/`; shipping them somewhere off-host is left to your own tooling.
- Caddy's access logs land in `./logs/caddy/`, with sensitive headers stripped before they're written.

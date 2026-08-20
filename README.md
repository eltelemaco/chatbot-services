# Corner Cuts Chatbots

Multi-service appointment chatbots for a barber shop and a restaurant, built as npm workspaces.

Each service has its own backend (Express + SQLite/sql.js) and static landing page (nginx), all served through a shared Caddy reverse proxy.

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
    ├── llm/                     # Hetzner/OpenAI-compatible LLM client
    └── logging/                 # Shared logging utilities
```

## Prerequisites

- Docker + Docker Compose
- Node.js 18+ (only for local dev outside Docker)
- `OPENROUTER_API_KEY` exported in your shell or set in `secrets.conf` (never committed)
- Copy `secrets.example.conf` to `secrets.conf` and fill in both values:

```bash
cp secrets.example.conf secrets.conf
# edit secrets.conf
```

## Deployment config (`.env`)

Domain names and the container registry namespace are read from a root `.env`
file, which Compose loads automatically. Copy the template and fill in your own
values — same pattern as `secrets.conf` above:

```bash
cp .env.example .env
# edit .env
```

| Variable | Controls |
|----------|----------|
| `BARBER_DOMAIN` | Public hostname for the barber service — used for its CORS allow-list (`ALLOWED_ORIGINS`), its Caddy site block, and the outbound `HTTP-Referer` header sent to the LLM provider |
| `RESTAURANT_DOMAIN` | Same three things, for the restaurant service |
| `DOCKERHUB_REPO` | Docker Hub namespace the four service images are built, pushed, and pulled under |

Every reference has an `example.com`-style default baked into `docker-compose.yml`,
so `docker compose config` and `docker compose up` work with no `.env` at all —
`.env` is what you edit to point the stack at your own domains.

One caveat if you run Caddy **outside** Compose: the Caddyfile uses Caddy's
`{$BARBER_DOMAIN}` / `{$RESTAURANT_DOMAIN}` placeholder syntax, which has no
default-value fallback like Compose's `${VAR:-default}`. If those variables are
unset in Caddy's environment, the site addresses resolve to empty strings and
Caddy refuses to start. Running via `docker compose up` avoids this — the Compose
file supplies the defaults.

## Required secrets

`secrets.conf` in the repo root must contain:

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API access |
| `ADMIN_KEY` | Admin endpoints such as `/api/appointments` debug listing |

## Run locally (Docker Compose)

From the repo root:

```bash
docker compose up --build
```

- Barber UI: http://localhost:8080
- Barber API health: http://localhost:3001/api/health
- Restaurant UI: http://localhost:8081
- Restaurant API health: http://localhost:3002/api/health

Compose picks up `docker-compose.override.yml` automatically, mapping ports locally while keeping production services `expose`-only.

## Local dev without Docker

```bash
# terminal 1 — barber backend
cd services/barber/backend
npm install
OPENROUTER_API_KEY=... npm run dev

# terminal 2 — restaurant backend
cd services/restaurant/backend
npm install
OPENROUTER_API_KEY=... npm run dev

# terminal 3 — open services/barber/landing/index.html
# and services/restaurant/landing/index.html
```

Root-level shortcuts:

```bash
npm run dev:barber     # workspace dev for barber backend
npm run dev:restaurant # workspace dev for restaurant backend
```

## Deploy to production

The deploy and ops automation under `scripts/` is maintainer-private and is
intentionally **not** part of this repo — it's tied to one specific host, SSH key,
log-shipping pipeline, and alerting setup, none of which would transfer to anyone
else's infrastructure. It's excluded via an explicit `scripts/` entry in
`.gitignore`.

If you're adapting this project, build your own deploy process for your own
target. Everything it needs is already in the repo: `docker-compose.yml` defines
the four services plus Caddy, `.env` supplies the domains and registry namespace,
and `secrets.conf` supplies the runtime secrets. A minimal deploy is "get the
repo, `.env`, and `secrets.conf` onto the host, then `docker compose up -d`" —
whether you drive that with rsync and SSH, a CI pipeline, or an image pull from
your `DOCKERHUB_REPO` namespace is up to you.

Two things worth handling in whatever you build: create the bind-mounted log
directories (`logs/caddy/`, `logs/barber-backend/`, `logs/restaurant-backend/`)
before the first `up`, and deploy services selectively (`docker compose up -d
restaurant-backend restaurant-landing`) so rolling out one service doesn't
recreate the other's containers.

## Service names

Compose service names are domain-prefixed to avoid collisions:

| Service | Compose name | Build context |
|---------|--------------|---------------|
| Barber backend | `barber-backend` | `services/barber/backend` |
| Barber landing | `barber-landing` | `services/barber/landing` |
| Restaurant backend | `restaurant-backend` | `services/restaurant/backend` |
| Restaurant landing | `restaurant-landing` | `services/restaurant/landing` |
| Reverse proxy | `caddy` | public `caddy:2-alpine` image |

## Common operational tasks

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

`BARBER_DOMAIN`, `RESTAURANT_DOMAIN`, and `DOCKERHUB_REPO` are set in `.env`
rather than per-container — see [Deployment config](#deployment-config-env).

## Notes

- Persistence uses SQLite via **sql.js** (pure JS/WASM — no native build).
- Backends use OpenAI-style **tool calling** for availability/booking; each enforces its own business rules and prevents double-booking.
- `shared/` is an npm workspace package (`@chatbot/shared`) consumed by both backends.
- Logs are bind-mounted under `./logs/<service>/`; shipping them off-host is left to your own tooling.
- Caddy access logs are written to `./logs/caddy/` with sensitive headers stripped.

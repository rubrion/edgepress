# EdgePress — White-label Deployment Guide

EdgePress is a single Cloudflare Worker (Astro SSR + D1) that runs the public blog, the admin editor, and the newsletter dispatcher. Each white-label tenant gets **one Worker deployment + one D1 database** — nothing else to host.

Email goes out via one of two providers, selected per-tenant:

- **Resend** — HTTP API, called directly from the Worker.
- **Gmail SMTP** — TCP from the Worker to `smtp.gmail.com:465` via `cloudflare:sockets`. No sidecar container.

---

## Architecture at a glance

```
                    ┌─RESEND─▶ api.resend.com (HTTPS)
[Reader]──HTTPS──┐  │
                 ├─▶[Astro/CF Worker]──▶[D1] (per-tenant SQLite)
[Admin] ──HTTPS──┘  │
                    └─GMAIL──▶ smtp.gmail.com:465 (TCP+TLS via cloudflare:sockets)
```

- All public pages, the admin UI, and `/api/*` run inside one Worker.
- D1 holds `subscribers`, `posts`, `campaigns` (schema in [`src/db/schema.ts`](./src/db/schema.ts)).
- Provider choice is a config flip (`EMAIL_PROVIDER` var); no code changes.

---

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| [Bun](https://bun.sh) | ≥ 1.3 | Package manager + dev server |
| Cloudflare account | — | Workers + D1 |
| `wrangler` (vendored) | 4.x | Provisioning + deploy (`bunx wrangler ...`) |
| Resend account | — | Only if `EMAIL_PROVIDER=RESEND` |
| Gmail account + App Password | — | Only if `EMAIL_PROVIDER=GMAIL` |

---

## Per-tenant deployment

> Run all commands from the repo root. Replace `tenant-name` with the tenant's slug.

### 1. Install

```sh
bun install                     # from repo root
```

### 2. Create the D1 database

```sh
bunx wrangler d1 create edgepress-tenant-name
```

Copy the returned `database_id` into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "edgepress-tenant-name",
    "database_id": "<paste-here>",
    "migrations_dir": "./drizzle"
  }
]
```

### 3. Set tenant `vars` in `wrangler.jsonc`

These are non-sensitive and live in version control (or a per-tenant override file):

```jsonc
"vars": {
  "CLIENT_NAME": "Tenant Brand",
  "CLIENT_DOMAIN": "tenant.example.com",
  "THEME_PRIMARY_COLOR": "#2563eb",
  "EMAIL_PROVIDER": "RESEND"        // or "GMAIL"
}
```

### 4. Apply database migrations

```sh
# Local (creates .wrangler/state/v3/d1/...)
bunx wrangler d1 migrations apply edgepress-tenant-name --local

# Remote (production)
bunx wrangler d1 migrations apply edgepress-tenant-name --remote
```

To regenerate the SQL after a schema change: `bun run db:generate`.

### 5. Set secrets

Secrets are stored encrypted on Cloudflare and never appear in source. Use `wrangler secret put`:

```sh
bunx wrangler secret put MASTER_ADMIN_KEY        # always

# If EMAIL_PROVIDER=RESEND
bunx wrangler secret put RESEND_API_KEY

# If EMAIL_PROVIDER=GMAIL
bunx wrangler secret put GMAIL_USER
bunx wrangler secret put GMAIL_APP_PASSWORD
```
### 6. Regenerate types and deploy

```sh
bun run cf-typegen        # refresh worker-configuration.d.ts
bun run deploy            # astro build + wrangler deploy
```

That's it. No second container to host.

---

## Environment variable reference

| Var | Where | Required when | Default | Purpose |
|-----|-------|---------------|---------|---------|
| `CLIENT_NAME` | `vars` in `wrangler.jsonc` | always | `EdgePress` | Brand name in UI, emails, OG `site_name` |
| `CLIENT_DOMAIN` | `vars` | always | `example.com` | Canonical URLs, sitemap, Resend `from` (`noreply@$CLIENT_DOMAIN`) |
| `CLIENT_TAGLINE` | `vars` | optional | _(default copy)_ | Subhead shown under the brand on the homepage |
| `CLIENT_LOGO_URL` | `vars` | optional | empty (text fallback) | Public URL of the brand logo. When set, the header renders `<img>` instead of the brand text |
| `CLIENT_FAVICON_URL` | `vars` | optional | `/favicon.svg` + `.ico` | Public URL of a custom favicon. When set, replaces the bundled defaults |
| `CLIENT_FONT` | `vars` | optional | local Atkinson | Google Font family name (e.g. `Inter`, `Playfair Display`). When set at build time, swaps the bundled local font for that Google Font |
| `THEME_PRIMARY_COLOR` | `vars` | always | `#2563eb` | Accent color, injected as `--theme-primary` |
| `EMAIL_PROVIDER` | `vars` | always | `RESEND` | `RESEND` or `GMAIL` |
| `EMAIL_FROM_ADDRESS` | `vars` | optional (`EMAIL_PROVIDER=RESEND`) | `noreply@$CLIENT_DOMAIN` | Resend `From` address (e.g. `news@brand.com`). The domain part must be verified in Resend. Ignored when `EMAIL_PROVIDER=GMAIL` (Gmail forces `From = $GMAIL_USER`). |
| `DB` | `d1_databases` binding | always | — | Tenant's D1 instance |
| `MASTER_ADMIN_KEY` | secret | always | — | Login key for `/admin/login`. Stored in an HttpOnly cookie after login |
| `RESEND_API_KEY` | secret | `EMAIL_PROVIDER=RESEND` | — | Resend API key (`re_...`). Used as `Authorization: Bearer …` to `api.resend.com/emails` |
| `GMAIL_USER` | secret | `EMAIL_PROVIDER=GMAIL` | — | Gmail address. Used as both SMTP login and the `From:` address (Gmail rejects mismatched senders) |
| `GMAIL_APP_PASSWORD` | secret | `EMAIL_PROVIDER=GMAIL` | — | [Gmail App Password](https://support.google.com/accounts/answer/185833) — not the account password |

> ⚠ `CLIENT_FONT` is read at **build time** (it configures Astro's font integration), so changing it requires a redeploy, not just a `wrangler secret put`. The other tenant `vars` are evaluated at request time and can be hot-swapped per environment.

### Local development (`.dev.vars`)

`.dev.vars` is the Wrangler equivalent of `.env` — only loaded when `wrangler dev` / `astro dev` runs. **Do not commit it.** Mirror the production secrets:

```sh
MASTER_ADMIN_KEY=local-dev-admin-key
RESEND_API_KEY=re_dev_xxx
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
```

---

## Local development

One terminal:

```sh
bunx wrangler d1 migrations apply edgepress --local   # one-time
bun run dev                                           # http://localhost:4321
```

Smoke test:

```sh
curl -X POST http://localhost:4321/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@test.com"}'
# → {"ok":true}

bunx wrangler d1 execute edgepress --local \
  --command "SELECT email, status FROM subscribers"
```

Then open `/admin/login`, paste your `MASTER_ADMIN_KEY`, write a markdown post, and hit **Publish + Send**.

> ⚠ The Gmail SMTP path uses `cloudflare:sockets`, which **only runs on the Cloudflare runtime** (production or `wrangler dev` / `astro dev` with the Cloudflare adapter). It cannot run in plain Node/Bun. Local Gmail sends only work through `astro dev`, not `astro preview`.

---

## Switching email providers

Migration is a config-only change — no code edits, no infra moves.

| From → To | Steps |
|-----------|-------|
| Resend → Gmail | 1. `wrangler secret put GMAIL_USER` and `GMAIL_APP_PASSWORD`. 2. Update `EMAIL_PROVIDER=GMAIL` in `wrangler.jsonc`. 3. `bun run deploy`. |
| Gmail → Resend | 1. `wrangler secret put RESEND_API_KEY`. 2. Update `EMAIL_PROVIDER=RESEND`. 3. `bun run deploy`. |

The `from` address differs between providers:
- **Resend** uses `$EMAIL_FROM_ADDRESS` if set, otherwise falls back to `noreply@$CLIENT_DOMAIN`. The domain must be verified in Resend either way.
- **Gmail** uses `$GMAIL_USER` directly (Gmail rejects mismatched senders, so you can't override the address — only the display name).

---

## Operational notes

- **Free-tier Worker CPU is 10ms per invocation.** Each Gmail send opens a TCP+TLS handshake to `smtp.gmail.com:465`, then reuses one session for all recipients (`MAIL FROM`/`RCPT TO`/`DATA` per email, `RSET` between). Realistic ceiling on the free tier is roughly a few hundred recipients per publish before you start hitting CPU caps. The paid Workers tier ($5/mo) lifts the cap to 30s CPU.
- **Gmail send quota** — Gmail SMTP caps at ~500 messages/day per account. Tenants with growing lists must move to Resend before hitting that wall.
- **Resend domain verification** — Resend rejects sends from unverified domains. Verify `CLIENT_DOMAIN` in the Resend dashboard before going live.
- **HTML sanitization** — Admin-authored markdown is rendered through `marked` without sanitization. Acceptable while the admin is the only author; before opening writes to a wider audience, add `isomorphic-dompurify` to the publish path in `src/pages/api/publish.ts`.
- **Per-recipient sends** — Each subscriber gets their own envelope (`MAIL FROM` / `RCPT TO`) so they only see their own address in `To:`. For very large lists, batching via Resend's `/emails/batch` endpoint is the next optimization.
- **Subscriber unsubscribe** — Not yet implemented. The `subscribers.status` column already supports `'unsubscribed'`; an unsubscribe link in the email template + a `/api/unsubscribe` endpoint is the obvious next add-on.

---

## Useful commands

| Command | What it does |
|---------|--------------|
| `bun run dev` | Astro dev server with miniflare |
| `bun run build` | Server build to `dist/` |
| `bun run preview` | Build + local preview (no D1 binding — won't run pages that hit D1) |
| `bun run deploy` | Build + `wrangler deploy` |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |
| `bunx wrangler tail` | Stream production logs |
| `bunx wrangler d1 execute edgepress --remote --command "..."` | Run SQL against production D1 |

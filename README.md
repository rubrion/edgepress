# EdgePress—the high-performance publishing engine

EdgePress is a single Cloudflare Worker (Astro SSR + D1 + R2) that runs the public blog, the admin editor, the media uploader, and the newsletter dispatcher. Each white-label tenant gets **one Worker deployment + one D1 database**, with all brand visuals configured live via an admin panel — no redeploy required.

Email goes out via one of two providers, selected per-tenant:

- **Resend** — HTTP API, called directly from the Worker.
- **Gmail SMTP** — TCP from the Worker to `smtp.gmail.com:465` via `cloudflare:sockets`. No sidecar container.


## See it in Action

Experience EdgePress live: **[edgepress.rubrion.ai](https://edgepress.rubrion.ai/)**

## Work with Us

Want this platform customized and deployed for your business? We offer end-to-end setup, white-label customization, and managed hosting so you can focus on building your brand. Let's get your publishing platform running today!

- **Visit our portal:** [rubrion.ai](https://rubrion.ai)
- **Email us:** [hello@rubrion.ai](mailto:hello@rubrion.ai)
- **WhatsApp:** [Chat with Samuel](https://wa.me/5511992562478?text=Ol%C3%A1%20Samuel!%20Tenho%20interesse%20em%20discutir%20uma%20oportunidade%20de%20projeto.)

---

## Architecture at a glance

```
                    ┌─RESEND─▶ api.resend.com (HTTPS)
[Reader]──HTTPS──┐  │
                 ├─▶[Astro/CF Worker]──┬──▶[D1] (per-tenant SQLite: posts, subscribers, campaigns, settings)
[Admin] ──HTTPS──┘  │                  └──▶[R2] (media uploads, optional shared bucket)
                    └─GMAIL──▶ smtp.gmail.com:465 (TCP+TLS via cloudflare:sockets)
```

- All public pages, the admin UI, `/api/*`, and media uploads run inside one Worker.
- D1 holds `posts`, `subscribers`, `campaigns`, `settings` (schema in [`src/db/schema.ts`](./src/db/schema.ts)).
- R2 holds uploaded images and videos, organized as `edgepress/<CLIENT_SLUG>/<yyyy-mm>/<uuid>.<ext>`. One bucket can be shared across tenants — slug-prefixed paths keep them isolated.
- Brand visuals (name, tagline, logo, favicon, theme color, email From-address) live in D1 and are editable from `/admin/settings` without redeploy.
- Provider choice is a config flip (`EMAIL_PROVIDER` var); no code changes.

---

## Built-in features

- **Markdown editor** with live preview, drag-drop / paste / button image + video upload (R2-backed, 50 MB cap), per-post Publish + Send to active subscribers.
- **Newsletter dispatch** with `List-Unsubscribe` + one-click POST headers (Gmail/Yahoo bulk-sender compliant), plain-text alternative, and per-subscriber unsubscribe links.
- **Subscriber unsubscribe** — `/api/unsubscribe?id=<uuid>` (GET for link clicks, POST for one-click). Sets `subscribers.status = 'unsubscribed'` so future dispatches skip them.
- **Post-delete media cleanup** — when a post is deleted from the admin, any R2 objects it referenced under your own bucket prefix are removed too. Externally-pasted URLs are left alone.
- **Dark / light mode** toggle in the header. Detects `prefers-color-scheme` on first visit, then persists user choice in `localStorage`.
- **i18n** — `en` and `pt-BR` translations for all public-facing UI. Detects browser `Accept-Language` on first visit, persists choice in a `lang` cookie. Adds `?lang` toggle in the header.
- **Live brand admin** at `/admin/settings` — change name, tagline, logo, favicon, accent color, email From-address without a deploy.

---

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| [Bun](https://bun.sh) | ≥ 1.3 | Package manager + dev server |
| Cloudflare account | — | Workers + D1 + R2 |
| `wrangler` (vendored) | 4.x | Provisioning + deploy (`bunx wrangler ...`) |
| Resend account | — | Only if `EMAIL_PROVIDER=RESEND` |
| Gmail account + App Password | — | Only if `EMAIL_PROVIDER=GMAIL` |

---

## Per-tenant deployment

> Run all commands from the repo root. Replace `<tenant>` with the tenant's slug (lowercase, hyphen-separated).

### 1. Install

```sh
bun install
```

### 2. Create the D1 database

```sh
bunx wrangler d1 create <tenant>-edgepress
```

Copy the returned `database_id` into `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "<tenant>-edgepress",
    "database_id": "<paste-here>",
    "migrations_dir": "./drizzle"
  }
]
```

> ⚠ The binding name **must be `DB`** for every tenant — that's the contract the code reads. Only `database_name` and `database_id` change per tenant.

### 3. Create (or pick) an R2 bucket for media

```sh
# If a media bucket doesn't already exist:
bunx wrangler r2 bucket create <your-bucket>

# Optional but recommended: attach a public custom domain (e.g. media.example.com)
# via the Cloudflare dashboard → R2 → Bucket → Settings → Connect Domain.
```

One bucket can be shared across all whitelabel tenants — uploads land under `edgepress/<CLIENT_SLUG>/...` so each tenant has its own folder.

### 4. Set tenant `vars` in `wrangler.jsonc`

Only **infrastructure** and **build-time** vars live here. Brand visuals are managed in the admin UI after first deploy.

```jsonc
"routes": [
  { "pattern": "<tenant>.example.com", "custom_domain": true }
],
"vars": {
  "CLIENT_DOMAIN": "<tenant>.example.com",
  "CLIENT_SLUG": "<tenant>",
  "CLIENT_FONT": "Inter",
  "MEDIA_PUBLIC_BASE": "https://media.example.com",
  "EMAIL_PROVIDER": "RESEND"
},
"r2_buckets": [
  { "binding": "MEDIA", "bucket_name": "<your-bucket>" }
]
```

### 5. Apply database migrations

```sh
# Local (creates .wrangler/state/v3/d1/...)
bunx wrangler d1 migrations apply <tenant>-edgepress --local

# Remote (production)
bunx wrangler d1 migrations apply <tenant>-edgepress --remote
```

This creates `posts`, `subscribers`, `campaigns`, and `settings` tables.

To regenerate the SQL after a schema change: `bun run db:generate`.

### 6. Set secrets

Secrets are stored encrypted on Cloudflare and never appear in source. Use `wrangler secret put`:

```sh
bunx wrangler secret put MASTER_ADMIN_KEY        # always

# If EMAIL_PROVIDER=RESEND
bunx wrangler secret put RESEND_API_KEY

# If EMAIL_PROVIDER=GMAIL
bunx wrangler secret put GMAIL_USER
bunx wrangler secret put GMAIL_APP_PASSWORD
```

### 7. Regenerate types and deploy

```sh
bun run cf-typegen        # refresh worker-configuration.d.ts
bun run deploy            # astro build + wrangler deploy
```

### 8. Configure brand visuals via admin

Open `https://<tenant>.example.com/admin/login`, paste your `MASTER_ADMIN_KEY`, then navigate to **`/admin/settings`** and fill in:

- Brand name
- Tagline
- Logo URL (or leave empty for text)
- Favicon URL
- Theme primary color (hex)
- Email From-address (Resend only — domain must be verified in Resend)

Saved values take effect immediately on the next page render. Empty a field to revert to its `wrangler.jsonc` seed (or the hard-coded default if no seed is set).

That's it. No second container to host.

---

## Configuration reference

EdgePress splits configuration into three layers, each with a different lifecycle:

### Admin-managed (D1 `settings` table) — change anytime, no redeploy

| Setting | Purpose | Wrangler seed key |
|---------|---------|-------------------|
| `clientName` | Brand name shown across UI, OG metadata, RSS, emails | `CLIENT_NAME` |
| `clientTagline` | Homepage subhead | `CLIENT_TAGLINE` |
| `clientLogoUrl` | Header logo (when set, replaces the brand text) | `CLIENT_LOGO_URL` |
| `clientFaviconUrl` | Custom favicon | `CLIENT_FAVICON_URL` |
| `themePrimaryColor` | Accent color, injected as `--theme-primary` | `THEME_PRIMARY_COLOR` |
| `emailFromAddress` | Resend `From` address (e.g. `news@brand.com`). Domain must be verified in Resend. Ignored when `EMAIL_PROVIDER=GMAIL`. | `EMAIL_FROM_ADDRESS` |

Resolution at request time: **DB row → `wrangler.jsonc` seed → hard-coded default**. Saving an empty value in admin removes the override and falls back to the seed.

### Wrangler `vars` — change requires redeploy

| Var | Required when | Purpose |
|-----|---------------|---------|
| `CLIENT_DOMAIN` | always | Canonical URLs, sitemap, default Resend `from` (`noreply@$CLIENT_DOMAIN`), Astro `site` URL |
| `CLIENT_SLUG` | always (R2 uploads) | Folder name under `edgepress/` in the media bucket. Keeps tenant uploads isolated |
| `CLIENT_FONT` | optional | Google Font family name (e.g. `Inter`, `Playfair Display`). Read at **build time** |
| `MEDIA_PUBLIC_BASE` | always (R2 uploads) | Public base URL of the R2 bucket (e.g. `https://media.example.com`). Used to build asset URLs after upload |
| `EMAIL_PROVIDER` | always | `RESEND` or `GMAIL` |

> ⚠ `CLIENT_FONT` is read at **build time** by `astro.config.mjs` (it configures Astro's font integration), so changing it requires a redeploy. It accepts either a bare family name (`"Inter"`) or a full CSS stack (`"'Inter', system-ui, sans-serif"`) — only the first family is used for Google Fonts loading; Astro auto-injects metric-matched fallbacks.

### Wrangler bindings — provisioned, named the same across tenants

| Binding | Type | Notes |
|---------|------|-------|
| `DB` | D1 | Per-tenant database. Binding name must always be `"DB"` |
| `MEDIA` | R2 | Bucket for image / video uploads. Bucket name can be shared; isolation is via `CLIENT_SLUG` prefix |
| `ASSETS` | Static assets | Astro's `dist/` output |

### Secrets — `wrangler secret put`

| Secret | Required when | Purpose |
|--------|---------------|---------|
| `MASTER_ADMIN_KEY` | always | Login key for `/admin/login`. Stored in an HttpOnly cookie after login |
| `RESEND_API_KEY` | `EMAIL_PROVIDER=RESEND` | Resend API key (`re_...`) |
| `GMAIL_USER` | `EMAIL_PROVIDER=GMAIL` | Gmail address. Used as both SMTP login and the `From:` address (Gmail rejects mismatched senders) |
| `GMAIL_APP_PASSWORD` | `EMAIL_PROVIDER=GMAIL` | [Gmail App Password](https://support.google.com/accounts/answer/185833) — not the account password |

### Local development (`.dev.vars`)

`.dev.vars` is the Wrangler equivalent of `.env` — only loaded when `wrangler dev` runs. **Do not commit it.** Mirror the production secrets:

```sh
MASTER_ADMIN_KEY=local-dev-admin-key
RESEND_API_KEY=re_dev_xxx
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx
```

---

## Local development

```sh
bunx wrangler d1 migrations apply <tenant>-edgepress --local   # one-time
bun run dev                                                    # http://localhost:4321
```

> ⚠ `bun run dev` runs `astro dev`, which has a Vite server but **no Cloudflare bindings**. For features that depend on `cloudflare:workers` env (D1, R2, env vars), use `bunx wrangler dev` instead.

Smoke test:

```sh
curl -X POST http://localhost:4321/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@test.com"}'
# → {"ok":true}

bunx wrangler d1 execute <tenant>-edgepress --local \
  --command "SELECT email, status FROM subscribers"
```

Then open `/admin/login`, paste your `MASTER_ADMIN_KEY`, configure brand visuals at `/admin/settings`, write a markdown post (drag-drop images!), and hit **Publish + Send**.

> ⚠ The Gmail SMTP path uses `cloudflare:sockets`, which **only runs on the Cloudflare runtime** (production or `wrangler dev`). It cannot run in plain Node/Bun.

---

## Switching email providers

Migration is a config-only change — no code edits, no infra moves.

| From → To | Steps |
|-----------|-------|
| Resend → Gmail | 1. `wrangler secret put GMAIL_USER` and `GMAIL_APP_PASSWORD`. 2. Update `EMAIL_PROVIDER=GMAIL` in `wrangler.jsonc`. 3. `bun run deploy`. |
| Gmail → Resend | 1. `wrangler secret put RESEND_API_KEY`. 2. Update `EMAIL_PROVIDER=RESEND`. 3. `bun run deploy`. (Also set the From address in `/admin/settings` if you want something other than `noreply@$CLIENT_DOMAIN`.) |

The `from` address differs between providers:
- **Resend** uses `emailFromAddress` from `/admin/settings` if set, otherwise falls back to `noreply@$CLIENT_DOMAIN`. The domain must be verified in Resend either way.
- **Gmail** uses `$GMAIL_USER` directly (Gmail rejects mismatched senders, so you can't override the address — only the display name).

---

## Email deliverability (avoiding spam)

For Resend, three DNS records on `$CLIENT_DOMAIN` are required for emails to land in inboxes rather than spam folders:

| Record | What it does |
|--------|-------------|
| **DKIM** (CNAMEs Resend provides) | Cryptographic proof the email wasn't tampered with |
| **SPF** (TXT) | Authorises Resend's servers to send on your behalf |
| **DMARC** (TXT on `_dmarc.$CLIENT_DOMAIN`) | Policy: e.g. `v=DMARC1; p=none; rua=mailto:postmaster@$CLIENT_DOMAIN` |

Add them in your Resend dashboard → Domains → Add domain → follow instructions. Without DKIM/SPF, Gmail / Outlook will reject or spam-fold messages even if everything else is configured correctly.

EdgePress already sends the headers Gmail's bulk-sender policy requires (`List-Unsubscribe`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, plain-text alternative).

---

## Operational notes

- **Free-tier Worker CPU is 10ms per invocation.** Each Gmail send opens a TCP+TLS handshake to `smtp.gmail.com:465`, then reuses one session for all recipients. Realistic ceiling on the free tier is roughly a few hundred recipients per publish before you hit CPU caps. The paid Workers tier ($5/mo) lifts the cap to 30s CPU.
- **Gmail send quota** — Gmail SMTP caps at ~500 messages/day per account. Tenants with growing lists must move to Resend before hitting that wall.
- **R2 free tier** — 10 GB storage + 1M Class A + 10M Class B operations/month. Egress is free, always. Realistically covers any newsletter blog without paid usage.
- **Media upload limit** — 50 MB per file (jpg, png, webp, gif, svg, mp4, webm). Configurable in `src/pages/api/media/upload.ts`.
- **Orphan media** — uploaded files that never end up referenced in a post stay in R2. Storage cost is trivial, deletion risk is real (broken images in already-sent emails), so we don't background-sweep. Posts deleted from the admin UI *do* get their referenced media cleaned up.
- **HTML sanitization** — Admin-authored markdown is rendered through `marked` without sanitization. Acceptable while the admin is the only author; before opening writes to a wider audience, add `isomorphic-dompurify` to the publish path in `src/pages/api/publish.ts`.
- **Per-recipient sends** — Each subscriber gets their own envelope (`MAIL FROM` / `RCPT TO`) so they only see their own address in `To:`. For very large lists, batching via Resend's `/emails/batch` endpoint is the next optimization.

---

## Useful commands

| Command | What it does |
|---------|--------------|
| `bun run dev` | Astro dev server (no CF bindings) |
| `bunx wrangler dev` | Wrangler dev server (full CF bindings: D1, R2, env vars) |
| `bun run build` | Server build to `dist/` |
| `bun run deploy` | Build + `wrangler deploy` |
| `bun run cf-typegen` | Regenerate `worker-configuration.d.ts` after editing `wrangler.jsonc` |
| `bun run db:generate` | Generate a new SQL migration in `drizzle/` after editing `src/db/schema.ts` |
| `bunx wrangler d1 migrations apply <db> --local` | Apply pending migrations to local D1 |
| `bunx wrangler d1 migrations apply <db> --remote` | Apply pending migrations to production D1 |
| `bunx wrangler tail` | Stream production logs |
| `bunx wrangler d1 execute <db> --remote --command "..."` | Run SQL against production D1 |

---

## License

This project is licensed under the [GPLv3 License](LICENSE).

# AI review token budgets

How to size `AI_REVIEW_DAILY_TOKEN_LIMIT` per tenant when running multiple
EdgePress whitelabels on a single Cloudflare account.

## How the budget works

Each tenant has its own D1 database, so each tenant gets its own
`ai_usage` row counter. The cap (`AI_REVIEW_DAILY_TOKEN_LIMIT`) lives in
that tenant's `wrangler.jsonc` `vars` block. The route reads today's
`tokens_used` from D1, projects the worst-case cost of the incoming call
(`ceil(input_chars / 3.5) + max_output_tokens`), and rejects with 429 if
the projection would push past the cap.

That gives you a hard per-tenant ceiling. The next layer up — your
**Cloudflare account's daily neuron budget** — is shared across every
Worker on the account, including all tenants.

## The Cloudflare free-tier ceiling

Workers AI free tier is **10,000 neurons/day per Cloudflare account**.
Beyond that, you pay per neuron at the published rate. The account is
the boundary, not the worker, the binding, or the namespace.

Neurons aren't tokens. The conversion varies by model, precision, and
batch behaviour, and Cloudflare doesn't publish a fixed table. For
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` (what EdgePress uses), a
practical rule of thumb is **~3–10 tokens per neuron**, meaning
**roughly 30k–100k tokens/day** of total throughput on the free tier
across the entire account.

That's a wide range. Treat the lower bound as the planning number.

## Starting recommendations

Pick the row matching how many active tenants you host. "Active" =
tenants that publish more than once a week and where the editor will
plausibly run AI review.

| Active tenants | Per-tenant `AI_REVIEW_DAILY_TOKEN_LIMIT` | Notes |
|---|---|---|
| 1 | `25000` | One tenant gets nearly the whole free pool. |
| 2 | `12000` | Two tenants splitting the floor evenly with headroom. |
| 3 | `8000` | Tight; expect occasional 429s on big posts. |
| 4–5 | `5000` | Likely starts hitting paid tier on busy days — budget for it. |
| 6+ | `3000` | Almost certainly paid; consider per-tenant paid plan or BYO key. |

These assume the **lower bound** of the conversion (3 tokens/neuron). If
your dashboard shows you're consistently using fewer neurons than the
math predicts, you can raise the per-tenant cap.

A typical newsletter review (1–5k char post) costs ~500–2500 tokens. So
a 5,000-token cap = ~2–10 reviews/day; a 25,000-token cap = ~10–50.

## Per-call worst case

`MAX_INPUT_CHARS = 50_000` and `max_tokens = 8192` in `review.ts`. Worst
case for a single call:

```
ceil(50_000 / 3.5) + 8192 ≈ 22_478 tokens
```

So any per-tenant cap below ~23k tokens means a single 50k-char post
*will* be rejected even on a fresh-day quota. That's intentional — it
forces clients submitting giant posts to either edit smaller chunks or
ask you to raise their cap. It also means your **floor for the cap**
should be ≥ 23k if you want every legal request to be servable on a
fresh day; below that you're rate-limiting by post size as well as by
volume.

If you don't want big posts to be hard-blocked, lower `MAX_INPUT_CHARS`
or raise the cap. Don't ship caps in the 5k–22k range unless you're OK
with the "giant post is impossible" tradeoff.

## How to actually pick a number

1. Set the cap conservatively (start at the table value above).
2. Deploy and use it for a week.
3. Check Cloudflare dashboard → Workers & Pages → AI → Usage. You see
   total neurons consumed per day.
4. If you're at <50% of free tier daily, raise per-tenant caps. If
   you're hitting the free tier ceiling and getting 429s from CF (not
   from your D1 check), lower per-tenant caps or upgrade.

There is no shortcut — the dashboard is ground truth. The numbers in
this doc are educated guesses to start from.

## What's *not* protected by this cap

- **Other Workers AI usage on the same account.** Anything else on the
  account that calls `env.AI.run(...)` shares the 10k neurons/day pool
  and isn't tracked by `ai_usage`. If you have other projects, factor
  their usage in.
- **Other Workers AI models invoked from EdgePress.** The counter is
  global across `review.ts` calls but doesn't distinguish models. If
  you ever add another AI route, either share the counter (same
  semantics) or give it its own table + env var.
- **Bursts within a single day.** A tenant can use their entire daily
  cap in 30 seconds. The cap is daily, not rate-per-minute. If you
  need rate-limiting (rare for a single-author CMS), add it via
  Cloudflare AI Gateway or a per-minute counter.

## Tuning a single tenant

To raise/lower one tenant's cap without touching others:

1. Edit that tenant's `wrangler.jsonc`:
   ```jsonc
   "AI_REVIEW_DAILY_TOKEN_LIMIT": "15000",
   ```
2. `bun run deploy` for that tenant.
3. No D1 change needed; the counter keeps counting, the cap just shifts.

To reset a tenant's counter (e.g. you raised the cap mid-day and want
their existing 429s to clear):

```
bunx wrangler d1 execute <tenant-db-name> --remote \
  --command "DELETE FROM ai_usage WHERE day = '$(date -u +%Y-%m-%d)'"
```

## Recommended default in this repo

`wrangler.jsonc` ships with `AI_REVIEW_DAILY_TOKEN_LIMIT: "100000"`,
which assumes paid tier or a single-tenant deployment. **For free-tier
multi-tenant hosting this is too high** — drop it to the value from
the table above before deploying additional tenants on the same CF
account.

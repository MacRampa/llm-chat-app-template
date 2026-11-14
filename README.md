# adeinternet.com

Redesign of the ADE Internet & Streaming site, built to run on Cloudflare Workers.

The site is static HTML in `public/`, served by a small Worker in `src/` that adds
two endpoints: the site assistant and lead capture.

## What's here

```
public/index.html      the whole site (English + Spanish, one file)
public/assets/         images taken from the existing adeinternet.com and optimized
src/index.ts           Worker: /api/chat and /api/lead, serves the site
dist/artifact.html     generated preview build — not used in production
```

The page is bilingual with an EN/ES switch in the top bar. Spanish copy comes from
the existing `adeinternet.com/es/` pages and is stored in `data-es` attributes next
to the English, so both live in the same file.

## Contact details the site uses

Phone, text and WhatsApp: **+1 415 595 3051**
Email: **info@adeinternet.com**, **adeinfo4@gmail.com**
WhatsApp channel: `https://whatsapp.com/channel/0029Vb6Nbvq2UPBLqppzll1L`
San Francisco, California 94112

These appear in `public/index.html` (contact cards, header, footer, FAQ) and in the
assistant fact sheet in both `public/index.html` and `src/index.ts`. Change them in
all of those places together.

## Running it

```bash
npm install
npm run dev        # http://localhost:8787
```

The assistant needs Workers AI, which only runs against Cloudflare — in `--local`
mode `/api/chat` returns 503 and the page falls back to the phone number.

## Deploying

```bash
npm run deploy
```

### Turn on lead capture

Leads go nowhere until you give them somewhere to land. Until then `/api/lead`
returns 503 on purpose, and the page offers the visitor a WhatsApp message
pre-filled with their details, so nothing is silently lost.

Pick either (or both):

**Cloudflare KV**

```bash
npx wrangler kv namespace create LEADS
```

Paste the printed id into the `kv_namespaces` block in `wrangler.jsonc` and
uncomment it. Read leads back with:

```bash
npx wrangler kv key list --binding LEADS
npx wrangler kv key get --binding LEADS "lead:2026-01-01T00:00:00.000Z:abcdef12"
```

**A webhook** (to get leads by email, into a sheet, or into a CRM)

```bash
npx wrangler secret put LEAD_WEBHOOK_URL
```

Every lead is POSTed there as JSON:

```json
{ "name": "", "phone": "", "address": "", "interest": "", "language": "",
  "notes": "", "source": "form | assistant", "at": "ISO timestamp" }
```

## The assistant

A floating "Ask ADE" button, bottom right. It is optional by design: every phone
number, WhatsApp link and email on the page is reachable without opening it.

It answers only from the fact sheet in `src/index.ts` (prices, plans, devices,
coverage, contact details) and is told not to invent speeds, coverage for a
specific address, install dates or channel counts. When it has a name and a phone
number it saves a lead with `source: "assistant"`.

To change what it can say, edit `FACTS` in `src/index.ts` **and** the matching
`FACTS` array in `public/index.html`.

## Preview build

`dist/artifact.html` is the same page with the document shell stripped, for
previewing outside Cloudflare. Regenerate it after editing `public/index.html`:

```bash
python3 tools/build-preview.py
```

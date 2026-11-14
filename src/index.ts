/**
 * adeinternet.com — site worker.
 *
 * Serves the static site from ./public and provides two endpoints:
 *   POST /api/chat  — the site assistant, answering from a fixed fact sheet
 *   POST /api/lead  — stores a captured lead (KV and/or an outbound webhook)
 *
 * The site works with neither endpoint available: the page falls back to the
 * phone number and a pre-filled WhatsApp message, so a lead is never lost.
 *
 * @license MIT
 */
import { Env, PageTurn, Lead } from "./types";

const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

/**
 * Everything the assistant is allowed to say. Keep this in step with the
 * FACTS block in public/index.html — both are the same source of truth.
 */
const FACTS = `You are the assistant for ADE Internet & Streaming (adeinternet.com), a low-cost internet and streaming provider based in San Francisco, California, serving San Francisco and the whole Bay Area, with a focus on the Latino community.

FACTS YOU MAY USE (never go beyond them):
- Internet & streaming: $60 per month, flat price. Includes unlimited internet, high-speed Wi-Fi, Emby Stream, quick installation.
- Already have internet? Add the ADE stream service for $10 per month, flat price.
- Primetime Package: latest IPTV box model, 150 Mbps wireless adapter, free technical support, a wide selection of live channels and on-demand movies. Pricing is not published - tell people to ask.
- No contracts. No charge for any of the equipment.
- 24/7 online technical support, free.
- Emby apps: Android TV, Apple TV, Google TV, Amazon Fire TV, Roku, LG Smart TV, Samsung Smart TV and more.
- Phone and WhatsApp: +1 415 595 3051. Email: info@adeinternet.com and adeinfo4@gmail.com. Based in San Francisco, California 94112.
- Staff answer in English and Spanish.
- Mission: affordable internet for low-income people, without sacrificing the agreed price.

RULES:
- Never invent speeds, coverage at a specific address, install dates, channel counts, or prices that are not listed above. If you do not know, say so plainly and give the phone number +1 415 595 3051.
- Reply in the visitor's language (Spanish if they write Spanish).
- Be short: 60 words or fewer, warm and plain-spoken.
- Your job is also to collect leads. Once the visitor shows real interest, ask for their name and phone number, and their address or neighborhood if they want a coverage check.
- Never ask for payment details, card numbers, or social security numbers.
- The visitor can always just call or WhatsApp +1 415 595 3051 instead of talking to you. Say so if they seem to want a person.`;

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (!url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		if (url.pathname === "/api/chat") {
			if (request.method === "OPTIONS") return new Response(null, { status: 204 });
			if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
			return handleChat(request, env);
		}

		if (url.pathname === "/api/lead") {
			if (request.method === "OPTIONS") return new Response(null, { status: 204 });
			if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
			return handleLead(request, env);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/** The site assistant. Returns { reply } as plain JSON. */
async function handleChat(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as { messages?: PageTurn[]; lang?: string };
		const turns = Array.isArray(body.messages) ? body.messages.slice(-16) : [];

		if (turns.length === 0) {
			return Response.json({ error: "No messages" }, { status: 400 });
		}

		const messages = [
			{ role: "system" as const, content: FACTS },
			...turns.map((t) => ({
				role: t.role === "assistant" ? ("assistant" as const) : ("user" as const),
				content: String(t.text ?? "").slice(0, 2000),
			})),
		];

		const result = (await env.AI.run(MODEL_ID, {
			messages,
			max_tokens: 300,
		})) as { response?: string };

		const reply = (result?.response ?? "").trim();
		if (!reply) throw new Error("Empty model response");

		return new Response(JSON.stringify({ reply }), { headers: JSON_HEADERS });
	} catch (error) {
		console.error("chat failed:", error);
		return new Response(
			JSON.stringify({ error: "Chat unavailable" }),
			{ status: 503, headers: JSON_HEADERS },
		);
	}
}

/**
 * Stores a lead. Succeeds only when it actually reached somewhere durable —
 * if nothing is configured it returns 503 so the page shows the visitor a
 * pre-filled WhatsApp message instead of silently dropping their details.
 */
async function handleLead(request: Request, env: Env): Promise<Response> {
	let lead: Lead;
	try {
		lead = (await request.json()) as Lead;
	} catch {
		return new Response(JSON.stringify({ error: "Bad JSON" }), { status: 400, headers: JSON_HEADERS });
	}

	const clean: Lead = {
		name: trim(lead.name, 120),
		phone: trim(lead.phone, 40),
		address: trim(lead.address, 240),
		interest: trim(lead.interest, 60),
		language: trim(lead.language, 10),
		notes: trim(lead.notes, 2000),
		source: trim(lead.source, 40) || "form",
		page_lang: trim(lead.page_lang, 10),
		at: new Date().toISOString(),
	};

	if (!clean.name || !clean.phone) {
		return new Response(
			JSON.stringify({ error: "Name and phone are required" }),
			{ status: 400, headers: JSON_HEADERS },
		);
	}

	const stored: string[] = [];

	if (env.LEADS) {
		try {
			const key = `lead:${clean.at}:${crypto.randomUUID().slice(0, 8)}`;
			await env.LEADS.put(key, JSON.stringify(clean));
			stored.push("kv");
		} catch (error) {
			console.error("KV write failed:", error);
		}
	}

	if (env.LEAD_WEBHOOK_URL) {
		try {
			const res = await fetch(env.LEAD_WEBHOOK_URL, {
				method: "POST",
				headers: JSON_HEADERS,
				body: JSON.stringify(clean),
			});
			if (res.ok) stored.push("webhook");
			else console.error("Webhook returned", res.status);
		} catch (error) {
			console.error("Webhook failed:", error);
		}
	}

	if (stored.length === 0) {
		// Logged so it is recoverable from Workers observability, but the page
		// is told this failed so the visitor is sent to WhatsApp instead.
		console.error("LEAD NOT STORED — no LEADS binding or LEAD_WEBHOOK_URL configured:", JSON.stringify(clean));
		return new Response(
			JSON.stringify({ error: "No lead destination configured" }),
			{ status: 503, headers: JSON_HEADERS },
		);
	}

	console.log("lead stored via", stored.join("+"));
	return new Response(JSON.stringify({ ok: true, stored }), { headers: JSON_HEADERS });
}

function trim(value: unknown, max: number): string {
	return typeof value === "string" ? value.trim().slice(0, max) : "";
}

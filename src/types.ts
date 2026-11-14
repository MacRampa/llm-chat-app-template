/**
 * Type definitions for the ADE Internet site worker.
 */

export interface Env {
	/** Workers AI binding — powers the site assistant. */
	AI: Ai;

	/** Static assets (the site in ./public). */
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	/**
	 * Optional KV namespace where submitted leads are stored.
	 * Create it and bind it as LEADS to keep leads on Cloudflare.
	 */
	LEADS?: KVNamespace;

	/**
	 * Optional outbound webhook (Zapier, Make, Formspree, a Google Apps
	 * Script, anything that accepts JSON). Each lead is POSTed to it.
	 */
	LEAD_WEBHOOK_URL?: string;
}

/** A turn in the site assistant conversation, as the page sends it. */
export interface PageTurn {
	role: "visitor" | "assistant";
	text: string;
}

/** A lead captured from the form or the assistant. */
export interface Lead {
	name?: string;
	phone?: string;
	address?: string;
	interest?: string;
	language?: string;
	notes?: string;
	source?: string;
	page_lang?: string;
	at?: string;
}

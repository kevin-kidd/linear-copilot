import { createHmac } from "node:crypto";
import type { LinearWebhookPayload } from "../types";

interface WebhookHeaders {
	"linear-delivery": string;
	"linear-event": string;
	"linear-signature": string;
}

interface WebhookTimestampPayload {
	webhookTimestamp: number;
}

const ALLOWED_IPS = [
	"35.231.147.226",
	"35.243.134.228",
	"34.140.253.14",
	"34.38.87.206",
];

export function verifyWebhookSignature(
	payload: string,
	signature: string,
	secret: string,
): boolean {
	const computedSignature = createHmac("sha256", secret)
		.update(payload)
		.digest("hex");
	return signature === computedSignature;
}

export function verifyWebhookTimestamp(
	payload: WebhookTimestampPayload,
): boolean {
	const webhookTime = payload.webhookTimestamp;
	const currentTime = Date.now();
	// Verify webhook is not older than 1 minute
	return Math.abs(currentTime - webhookTime) <= 60 * 1000;
}

export function verifyWebhookIp(ip: string): boolean {
	return ALLOWED_IPS.includes(ip);
}

export function isIssueCreationEvent(payload: LinearWebhookPayload): boolean {
	return Boolean(
		payload.type === "Issue" &&
			payload.action === "create" &&
			payload.data?.id &&
			payload.data?.title,
	);
}

export function isIssueLabelUpdateEvent(
	payload: LinearWebhookPayload & { updatedFrom?: { labelIds?: string[] } },
): boolean {
	return Boolean(
		payload.type === "Issue" &&
			payload.action === "update" &&
			payload.data?.id &&
			// Check if labels were part of the update
			(payload.updatedFrom?.labelIds !== undefined ||
				payload.data?.labels?.nodes !== undefined),
	);
}

export function validateWebhookRequest(
	headers: WebhookHeaders,
	body: string,
	ip: string,
	webhookSecret: string,
): boolean {
	if (!webhookSecret) {
		throw new Error("LINEAR_WEBHOOK_SECRET is not configured");
	}

	// Verify IP
	if (!verifyWebhookIp(ip)) {
		console.error("Invalid webhook IP:", ip);
		return false;
	}

	// Verify signature
	if (
		!verifyWebhookSignature(body, headers["linear-signature"], webhookSecret)
	) {
		console.error("Invalid webhook signature");
		return false;
	}

	// Verify timestamp
	const payload = JSON.parse(body) as WebhookTimestampPayload;
	if (!verifyWebhookTimestamp(payload)) {
		console.error("Webhook timestamp is too old");
		return false;
	}

	return true;
}

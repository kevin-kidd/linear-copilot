import { serve } from "@upstash/workflow/cloudflare";
import type { LinearWebhookPayload } from "./types";
import {
	createBugAgentTools,
	createFeatureAgentTools,
	createImprovementAgentTools,
	createManagerAgentTools,
} from "./utils/agent-tools";
import { initializeLinearClient, validateEnv } from "./utils/agent-utils";
import { createCommentTool } from "./utils/tools";
import {
	isIssueCreationEvent,
	isIssueLabelUpdateEvent,
	validateWebhookRequest,
} from "./utils/webhook";

export interface Env {
	upstashRedisUrl: string;
	upstashRedisToken: string;
	linearWebhookSecret: string;
	managerApiKey: string;
	bugApiKey: string;
	featureApiKey: string;
	improvementApiKey: string;
}

interface WebhookRequest {
	headers: Record<string, string>;
	body: string;
}

interface ValidationResult {
	status: "valid" | "ignored";
	message?: string;
	payload?: LinearWebhookPayload;
}

export default serve(async (context) => {
	// Validate environment variables before processing any requests
	const env = validateEnv(context.env);

	// Get request data
	const request = context.requestPayload as WebhookRequest;
	const headers = {
		"linear-delivery": request.headers["linear-delivery"] || "",
		"linear-event": request.headers["linear-event"] || "",
		"linear-signature": request.headers["linear-signature"] || "",
	};
	const body = request.body;
	const ip = request.headers["cf-connecting-ip"] || "0.0.0.0";

	// Initial webhook validation step
	const validationResult = await context.run<ValidationResult>(
		"validate-webhook",
		async () => {
			if (!validateWebhookRequest(headers, body, ip, env.linearWebhookSecret)) {
				throw new Error("Invalid webhook request");
			}

			const payload = JSON.parse(body) as LinearWebhookPayload;
			if (
				!(isIssueCreationEvent(payload) || isIssueLabelUpdateEvent(payload))
			) {
				return { status: "ignored", message: "Event type not supported" };
			}

			return { status: "valid", payload };
		},
	);

	if (validationResult.status === "ignored") {
		return validationResult;
	}

	if (!validationResult.payload) {
		throw new Error("Validation succeeded but no payload was returned");
	}

	const payload = validationResult.payload;
	const { id: issueId, title, description, labels } = payload.data;
	if (!issueId) {
		throw new Error("Invalid payload: missing issue ID");
	}

	// Initialize clients step
	const clients = await context.run("initialize-clients", async () => {
		return {
			manager: initializeLinearClient(env.managerApiKey, "manager"),
			bug: initializeLinearClient(env.bugApiKey, "bug"),
			feature: initializeLinearClient(env.featureApiKey, "feature"),
			improvement: initializeLinearClient(env.improvementApiKey, "improvement"),
		};
	});

	// Process issue with appropriate agent
	const firstLabel = labels?.nodes?.[0]?.name || "";
	const issueLabel = firstLabel.toLowerCase();

	const result = await context.run("process-issue", async () => {
		const model = context.agents.openai("gpt-4");

		// Create agents with their specialized tools
		const managerAgent = context.agents.agent({
			model,
			name: "manager-agent",
			tools: createManagerAgentTools(clients.manager),
			maxSteps: 5,
			background: `You are a manager agent responsible for:
				- Validating and assigning issues to specialized agents
				- Setting initial priorities
				- Coordinating between different agents
				- Managing overall workflow
				
				Use your specialized tools to:
				1. Analyze requirements and set initial priorities
				2. Assign tasks to appropriate agents
				3. Monitor workload and coordinate efforts`,
		});

		const bugAgent = context.agents.agent({
			model,
			name: "bug-agent",
			tools: createBugAgentTools(clients.bug),
			maxSteps: 5,
			background: `You are a specialized bug analysis agent responsible for:
				- Analyzing bug reports and identifying root causes
				- Assessing security implications
				- Researching similar issues and solutions
				- Providing detailed reproduction steps
				
				Use your specialized tools to:
				1. Analyze code for potential issues
				2. Check security implications
				3. Search Stack Overflow and documentation
				4. Provide detailed recommendations`,
		});

		const featureAgent = context.agents.agent({
			model,
			name: "feature-agent",
			tools: createFeatureAgentTools(clients.feature),
			maxSteps: 5,
			background: `You are a specialized feature analysis agent responsible for:
				- Analyzing feature requests and market needs
				- Researching similar products and solutions
				- Assessing technical feasibility
				- Providing implementation recommendations
				
				Use your specialized tools to:
				1. Research market and competitors
				2. Analyze requirements and dependencies
				3. Search for similar implementations
				4. Provide detailed specifications`,
		});

		const improvementAgent = context.agents.agent({
			model,
			name: "improvement-agent",
			tools: createImprovementAgentTools(clients.improvement),
			maxSteps: 5,
			background: `You are a specialized improvement agent responsible for:
				- Analyzing technical optimization opportunities
				- Assessing and reducing technical debt
				- Improving system performance
				- Providing implementation strategies
				
				Use your specialized tools to:
				1. Analyze code performance and patterns
				2. Assess technical debt
				3. Research best practices
				4. Provide detailed improvement plans`,
		});

		const task = context.agents.task({
			model,
			prompt: `Process the following issue:
				Issue ID: ${issueId}
				Title: ${title}
				Description: ${description}
				Label: ${issueLabel}

				Steps:
				1. Manager Agent: Validate the issue label and determine the appropriate agent.
				   - If the label is 'bug', 'feature', or 'improvement', assign to the corresponding agent.
				   - If the label is invalid, request a valid label.
				   - Set initial priority based on description.

				2. Assigned Agent: Use your specialized tools to:
				   - Perform thorough analysis using your specific toolset
				   - Research similar issues/solutions
				   - Provide detailed recommendations
				   - Set appropriate priority based on analysis

				3. Other Agents: Provide additional insights if relevant to your specialization.
				
				Important: 
				- Always use issue ID ${issueId} for Linear interactions
				- Each agent has unique tools - use them appropriately
				- Follow your specific analysis process
				- Consider security and performance implications
				- Set priorities based on thorough analysis`,
			agents: [managerAgent, bugAgent, featureAgent, improvementAgent],
			maxSteps: 10,
		});

		try {
			return await task.run();
		} catch (error) {
			// Log error and notify on Linear
			const errorComment = createCommentTool(clients.manager, "Manager Bot");
			await errorComment.invoke({
				issueId,
				content:
					"An error occurred while processing this issue. The team has been notified.",
			});
			throw error;
		}
	});

	return {
		message: "Issue processed successfully",
		result: result.text,
	};
});

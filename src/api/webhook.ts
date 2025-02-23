import { serve } from "@upstash/workflow/nextjs";
import { AgentType } from "../types";
import type { LinearWebhookPayload } from "../types";
import {
	validateWebhookRequest,
	isIssueCreationEvent,
	isIssueLabelUpdateEvent,
} from "../utils/webhook";
import { validateEnv, initializeLinearClient } from "../utils/agent-utils";
import {
	createManagerAgentTools,
	createBugAgentTools,
	createFeatureAgentTools,
	createImprovementAgentTools,
} from "../utils/agent-tools";
import { createCommentTool } from "../utils/tools";

export const POST = serve(async (context) => {
	// Validate environment variables before processing any requests
	const env = validateEnv(context.env);

	return async (req: Request) => {
		try {
			const body = await req.text();
			const headers = {
				"linear-delivery": req.headers.get("linear-delivery") || "",
				"linear-event": req.headers.get("linear-event") || "",
				"linear-signature": req.headers.get("linear-signature") || "",
			};

			const ip =
				req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
				req.headers.get("x-real-ip") ||
				"0.0.0.0";

			if (!validateWebhookRequest(headers, body, ip, env.linearWebhookSecret)) {
				return new Response(
					JSON.stringify({
						error: "Invalid webhook request",
						details: "Failed to validate webhook signature or request",
					}),
					{
						status: 401,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			const payload = JSON.parse(body) as LinearWebhookPayload;

			if (!isIssueCreationEvent(payload) && !isIssueLabelUpdateEvent(payload)) {
				return new Response(
					JSON.stringify({
						message: "Event ignored",
						details: "Event type not supported",
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			// Validate payload data
			const { id: issueId, title, description, labels } = payload.data;
			if (!issueId) {
				throw new Error("Invalid payload: missing issue ID");
			}

			const model = context.agents.openai("gpt-4");

			// Initialize Linear clients with validated environment
			const managerClient = initializeLinearClient(
				env.managerLinearApiKey,
				"manager"
			);
			const bugClient = initializeLinearClient(
				env.bugLinearApiKey,
				"bug"
			);
			const featureClient = initializeLinearClient(
				env.featureLinearApiKey,
				"feature"
			);
			const improvementClient = initializeLinearClient(
				env.improvementLinearApiKey,
				"improvement"
			);

			// Create agents with specialized tools
			const managerAgent = context.agents.agent({
				model,
				name: "manager-agent",
				tools: createManagerAgentTools(managerClient),
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
				tools: createBugAgentTools(bugClient),
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
				tools: createFeatureAgentTools(featureClient),
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
				tools: createImprovementAgentTools(improvementClient),
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

			// Extract and validate label
			const firstLabel = labels?.nodes?.[0]?.name || "";
			const issueLabel = firstLabel.toLowerCase();

			// Create task with all agents including manager
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
				// Run the task which will handle validation, assignment and processing
				const result = await task.run();

				return new Response(
					JSON.stringify({
						message: "Issue processed successfully",
						taskResult: result.text,
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				);
			} catch (taskError) {
				// Handle task execution errors
				console.error("Task execution error:", taskError);

				// Attempt to notify about the error on Linear
				try {
					const errorComment = createCommentTool(managerClient, "Manager Bot");
					await errorComment.invoke({
						issueId,
						content:
							"An error occurred while processing this issue. The team has been notified.",
					});
				} catch (commentError) {
					console.error("Failed to comment error on issue:", commentError);
				}

				throw taskError;
			}
		} catch (error) {
			console.error("Error processing webhook:", error);

			// Provide more detailed error response
			return new Response(
				JSON.stringify({
					error: "Error processing webhook",
					details: error instanceof Error ? error.message : "Unknown error",
					type: error instanceof Error ? error.constructor.name : "Unknown",
				}),
				{
					status: 500,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
	};
});

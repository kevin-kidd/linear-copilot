import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { StackExchangeAPI } from "@langchain/community/tools/stackexchange";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import type { LinearClient } from "@linear/sdk";
import type { WorkflowTool } from "@upstash/workflow";
import { z } from "zod";

// Import types from tools
import {
	createCodeAnalysisTool,
	createCommentTool,
	createDependencyAnalysisTool,
	createPriorityAssessmentTool,
	createRequirementsAnalysisTool,
	createSecurityAnalysisTool,
} from "./tools";

// Define base schema type for tools
type BaseSchema = z.ZodType<unknown>;

// Define extended tool type that preserves the schema type
interface ExtendedWorkflowTool<T extends BaseSchema = BaseSchema>
	extends Omit<WorkflowTool<T>, "executeAsStep" | "invoke"> {
	executeAsStep?: boolean;
	schema: T;
	invoke: (params: z.infer<T>) => Promise<unknown>;
}

// Helper function to cast tools while preserving their schema type
function asExtendedTool<T extends BaseSchema>(
	tool: WorkflowTool<T>,
): ExtendedWorkflowTool<T> {
	return {
		...tool,
		executeAsStep: true,
		invoke: async (params: z.infer<T>) => tool.invoke(params),
	} as ExtendedWorkflowTool<T>;
}

// Error handling wrapper for tools
function withErrorHandling<T extends BaseSchema>(
	tool: ExtendedWorkflowTool<T>,
	errorMessage: string,
): ExtendedWorkflowTool<T> {
	const wrappedTool = { ...tool };
	const originalInvoke = tool.invoke.bind(tool);

	wrappedTool.invoke = async (params: z.infer<T>) => {
		try {
			return await originalInvoke(params);
		} catch (error) {
			console.error(`${errorMessage}:`, error);
			throw new Error(
				`${errorMessage}: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	};

	return wrappedTool;
}

// Wrapper to add executeAsStep to external tools
function makeExecutableStep<T extends string | Record<string, unknown>>(tool: {
	invoke(input: T): Promise<unknown>;
	description: string;
}): ExtendedWorkflowTool<z.ZodType<T>> {
	const schema = typeof tool === "string" ? z.string() : z.record(z.unknown());
	return {
		...tool,
		executeAsStep: true,
		schema: schema as z.ZodType<T>,
		description: tool.description,
		invoke: tool.invoke,
	};
}

// Manager Agent Tools - Focus on coordination and task management
export const createManagerAgentTools = (client: LinearClient) => ({
	// Core management tools
	comment: withErrorHandling(
		asExtendedTool(createCommentTool(client, "Manager Bot")),
		"Failed to add comment",
	),
	taskAssignment: withErrorHandling(
		{
			description: "Assign Linear issue to appropriate agent based on type",
			schema: z.object({
				issueId: z.string(),
				agentType: z.enum(["Bug", "Feature", "Improvement"]),
			}),
			invoke: async ({ issueId, agentType }) => {
				// Get the issue
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Get the team member for the agent type
				const teams = await client.teams();
				const team = teams.nodes[0]; // Assuming single team setup
				if (!team) {
					throw new Error("No team found");
				}

				const teamMembers = await team.members();
				const agent = teamMembers.nodes.find((member) =>
					member.name.includes(agentType),
				);

				if (!agent) {
					throw new Error(`No team member found for agent type: ${agentType}`);
				}

				// Assign the issue
				await issue.update({
					assigneeId: agent.id,
				});

				return {
					success: true,
					message: `Issue ${issueId} assigned to ${agentType} agent`,
					assignedTo: agent.name,
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to assign task",
	),
	search: makeExecutableStep(new DuckDuckGoSearch()),
});

// Bug Agent Tools - Focus on debugging and issue resolution
export const createBugAgentTools = (client: LinearClient) => ({
	// Core bug tools
	comment: withErrorHandling(
		createCommentTool(client, "Bug Bot"),
		"Failed to add comment",
	),
	analyzeBug: withErrorHandling(
		{
			description: "Analyze bug report and provide structured analysis",
			schema: z.object({
				issueId: z.string(),
				description: z.string(),
				stackTrace: z.string().optional(),
				environment: z.string().optional(),
			}),
			invoke: async ({ issueId, description, stackTrace, environment }) => {
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Extract key information from description
				const analysis = {
					type: description.toLowerCase().includes("crash")
						? "crash"
						: description.toLowerCase().includes("security")
							? "security"
							: description.toLowerCase().includes("performance")
								? "performance"
								: "functional",
					severity: description.toLowerCase().includes("critical")
						? "critical"
						: description.toLowerCase().includes("high")
							? "high"
							: description.toLowerCase().includes("medium")
								? "medium"
								: "low",
					hasStackTrace: !!stackTrace,
					hasEnvironmentInfo: !!environment,
					impactedAreas: extractImpactedAreas(description),
				};

				// Update issue with labels based on analysis
				const labels = await client.issueLabels();
				const typeLabel = labels.nodes.find(
					(l) => l.name === `type:${analysis.type}`,
				);
				const severityLabel = labels.nodes.find(
					(l) => l.name === `severity:${analysis.severity}`,
				);

				await issue.update({
					labelIds: [typeLabel?.id, severityLabel?.id].filter(
						(id): id is string => id !== undefined,
					),
				});

				return {
					analysis,
					recommendations: [
						analysis.hasStackTrace
							? "Stack trace provided for debugging"
							: "Request stack trace if reproducible",
						analysis.hasEnvironmentInfo
							? "Environment info available"
							: "Request environment details",
						...generateRecommendations(analysis),
					],
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to analyze bug",
	),
	updatePriority: withErrorHandling(
		{
			description: "Update bug priority based on impact and urgency",
			schema: z.object({
				issueId: z.string(),
				impact: z.enum(["critical", "high", "medium", "low"]),
				urgency: z.enum(["critical", "high", "medium", "low"]),
				reason: z.string(),
			}),
			invoke: async ({ issueId, impact, urgency, reason }) => {
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Calculate priority (1-4, where 1 is highest)
				const priorityMatrix: Record<string, Record<string, number>> = {
					critical: { critical: 1, high: 1, medium: 2, low: 2 },
					high: { critical: 1, high: 2, medium: 2, low: 3 },
					medium: { critical: 2, high: 2, medium: 3, low: 3 },
					low: { critical: 2, high: 3, medium: 3, low: 4 },
				};

				const priority = priorityMatrix[impact]?.[urgency] ?? 3; // Default to medium priority if mapping fails

				// Update issue priority
				await issue.update({ priority });

				// Add comment explaining priority
				await createCommentTool(client, "Bug Bot").invoke({
					issueId,
					content: `Priority updated to P${priority}\nImpact: ${impact}\nUrgency: ${urgency}\nReason: ${reason}`,
				});

				return {
					newPriority: priority,
					impact,
					urgency,
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to update priority",
	),
	searchSimilar: withErrorHandling(
		{
			description: "Search for similar bug reports and solutions",
			schema: z.object({
				query: z.string(),
				errorMessage: z.string().optional(),
				stackTrace: z.string().optional(),
			}),
			invoke: async ({ query, errorMessage, stackTrace }) => {
				const searchTerms = [
					query,
					errorMessage ? `"${errorMessage}"` : "",
					stackTrace ? `"${stackTrace.split("\n")[0]}"` : "",
				].filter(Boolean);

				const results = await Promise.all([
					// Search Stack Overflow
					makeExecutableStep(
						new StackExchangeAPI({
							maxResult: 3,
							queryType: "all",
							resultSeparator: "\n\n",
						}),
					).invoke(searchTerms.join(" ")),
					// Search GitHub issues
					makeExecutableStep(new DuckDuckGoSearch()).invoke(
						`site:github.com ${searchTerms.join(" ")} label:bug`,
					),
				]);

				return {
					stackOverflow: results[0],
					githubIssues: results[1],
					searchQuery: searchTerms.join(" "),
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to search similar issues",
	),
	// Research tools for additional context
	stackOverflow: makeExecutableStep(
		new StackExchangeAPI({
			maxResult: 3,
			queryType: "all",
			resultSeparator: "\n\n",
		}),
	),
	search: makeExecutableStep(new DuckDuckGoSearch()),
});

// Helper functions for bug analysis
function extractImpactedAreas(description: string): string[] {
	const areas = [];
	const lowerDesc = description.toLowerCase();

	if (lowerDesc.includes("api") || lowerDesc.includes("endpoint")) {
		areas.push("api");
	}
	if (lowerDesc.includes("database") || lowerDesc.includes("data")) {
		areas.push("database");
	}
	if (lowerDesc.includes("ui") || lowerDesc.includes("interface")) {
		areas.push("ui");
	}
	if (lowerDesc.includes("auth") || lowerDesc.includes("login")) {
		areas.push("authentication");
	}
	if (lowerDesc.includes("integration")) {
		areas.push("integrations");
	}
	if (lowerDesc.includes("workflow") || lowerDesc.includes("process")) {
		areas.push("workflows");
	}

	return areas;
}

interface BugAnalysis {
	type: string;
	severity: string;
	hasStackTrace: boolean;
	hasEnvironmentInfo: boolean;
	impactedAreas: string[];
}

function generateRecommendations(analysis: BugAnalysis): string[] {
	const recommendations = [];

	if (analysis.type === "crash") {
		recommendations.push("Gather crash reports and logs");
		recommendations.push("Check for recent deployments or changes");
	}

	if (analysis.type === "security") {
		recommendations.push("Assess potential data exposure");
		recommendations.push("Review authentication/authorization flows");
	}

	if (analysis.type === "performance") {
		recommendations.push("Collect performance metrics");
		recommendations.push("Review resource utilization");
	}

	if (analysis.impactedAreas.includes("api")) {
		recommendations.push("Review API logs and error rates");
	}

	if (analysis.impactedAreas.includes("database")) {
		recommendations.push("Check database performance and queries");
	}

	return recommendations;
}

// Feature Agent Tools - Focus on market research and requirements
export const createFeatureAgentTools = (client: LinearClient) => ({
	// Core feature tools
	comment: withErrorHandling(
		createCommentTool(client, "Feature Bot"),
		"Failed to add comment",
	),
	analyzeFeature: withErrorHandling(
		{
			description: "Analyze feature request and provide structured analysis",
			schema: z.object({
				issueId: z.string(),
				description: z.string(),
				userStory: z.string().optional(),
				acceptanceCriteria: z.array(z.string()).optional(),
			}),
			invoke: async ({
				issueId,
				description,
				userStory,
				acceptanceCriteria,
			}) => {
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Extract key information from description
				const analysis = {
					type: description.toLowerCase().includes("enhancement")
						? "enhancement"
						: description.toLowerCase().includes("integration")
							? "integration"
							: description.toLowerCase().includes("optimization")
								? "optimization"
								: "new-feature",
					scope: description.toLowerCase().includes("core")
						? "core"
						: description.toLowerCase().includes("api")
							? "api"
							: description.toLowerCase().includes("ui")
								? "ui"
								: "general",
					hasUserStory: !!userStory,
					hasAcceptanceCriteria:
						!!acceptanceCriteria && acceptanceCriteria.length > 0,
					impactedAreas: extractFeatureImpact(description),
				};

				// Update issue with labels based on analysis
				const labels = await client.issueLabels();
				const typeLabel = labels.nodes.find(
					(l) => l.name === `type:${analysis.type}`,
				);
				const scopeLabel = labels.nodes.find(
					(l) => l.name === `scope:${analysis.scope}`,
				);

				await issue.update({
					labelIds: [typeLabel?.id, scopeLabel?.id].filter(
						(id): id is string => id !== undefined,
					),
				});

				return {
					analysis,
					recommendations: [
						analysis.hasUserStory
							? "User story provided"
							: "Define clear user story",
						analysis.hasAcceptanceCriteria
							? "Acceptance criteria defined"
							: "Define acceptance criteria",
						...generateFeatureRecommendations(analysis),
					],
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to analyze feature",
	),
	updatePriority: withErrorHandling(
		{
			description: "Update feature priority based on business value and effort",
			schema: z.object({
				issueId: z.string(),
				businessValue: z.enum(["critical", "high", "medium", "low"]),
				implementationEffort: z.enum(["small", "medium", "large", "xlarge"]),
				reason: z.string(),
			}),
			invoke: async ({
				issueId,
				businessValue,
				implementationEffort,
				reason,
			}) => {
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Calculate priority (1-4, where 1 is highest)
				const priorityMatrix: Record<string, Record<string, number>> = {
					critical: { small: 1, medium: 1, large: 2, xlarge: 2 },
					high: { small: 1, medium: 2, large: 2, xlarge: 3 },
					medium: { small: 2, medium: 2, large: 3, xlarge: 3 },
					low: { small: 3, medium: 3, large: 4, xlarge: 4 },
				};

				const priority =
					priorityMatrix[businessValue]?.[implementationEffort] ?? 3;

				// Update issue priority
				await issue.update({ priority });

				// Add comment explaining priority
				await createCommentTool(client, "Feature Bot").invoke({
					issueId,
					content: `Priority updated to P${priority}\nBusiness Value: ${businessValue}\nImplementation Effort: ${implementationEffort}\nReason: ${reason}`,
				});

				return {
					newPriority: priority,
					businessValue,
					implementationEffort,
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to update priority",
	),
	researchSimilar: withErrorHandling(
		{
			description: "Research similar features and market solutions",
			schema: z.object({
				query: z.string(),
				market: z.string().optional(),
				competitors: z.array(z.string()).optional(),
			}),
			invoke: async ({ query, market, competitors }) => {
				const searchTerms = [
					query,
					market ? `in ${market} market` : "",
					...(competitors || []).map((c: string) => `site:${c}`),
				].filter(Boolean);

				const results = await Promise.all([
					// Search ProductHunt
					makeExecutableStep(new DuckDuckGoSearch()).invoke(
						`site:producthunt.com ${searchTerms.join(" ")}`,
					),
					// Search competitors
					makeExecutableStep(new DuckDuckGoSearch()).invoke(
						`${searchTerms.join(" ")} feature announcement blog post`,
					),
				]);

				return {
					productHunt: results[0],
					competitorAnalysis: results[1],
					searchQuery: searchTerms.join(" "),
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to research similar features",
	),
	// Research tools for additional context
	search: makeExecutableStep(new DuckDuckGoSearch()),
});

// Helper functions for feature analysis
function extractFeatureImpact(description: string): string[] {
	const areas = [];
	const lowerDesc = description.toLowerCase();

	if (lowerDesc.includes("performance") || lowerDesc.includes("speed")) {
		areas.push("performance");
	}
	if (lowerDesc.includes("memory") || lowerDesc.includes("resource")) {
		areas.push("resource-usage");
	}
	if (
		lowerDesc.includes("maintainability") ||
		lowerDesc.includes("code quality")
	) {
		areas.push("maintainability");
	}
	if (lowerDesc.includes("security") || lowerDesc.includes("vulnerability")) {
		areas.push("security");
	}
	if (lowerDesc.includes("scalability") || lowerDesc.includes("scale")) {
		areas.push("scalability");
	}
	if (lowerDesc.includes("reliability") || lowerDesc.includes("stability")) {
		areas.push("reliability");
	}

	return areas;
}

interface FeatureAnalysis {
	type: string;
	scope: string;
	hasUserStory: boolean;
	hasAcceptanceCriteria: boolean;
	impactedAreas: string[];
}

function generateFeatureRecommendations(analysis: FeatureAnalysis): string[] {
	const recommendations = [];

	if (analysis.type === "integration") {
		recommendations.push("Document integration requirements");
		recommendations.push("Define data exchange formats");
	}

	if (analysis.type === "optimization") {
		recommendations.push("Define performance metrics");
		recommendations.push("Set optimization targets");
	}

	if (analysis.impactedAreas.includes("api")) {
		recommendations.push("Design API endpoints");
		recommendations.push("Document API changes");
	}

	if (analysis.impactedAreas.includes("ui/ux")) {
		recommendations.push("Create wireframes/mockups");
		recommendations.push("Plan user testing");
	}

	if (analysis.impactedAreas.includes("database")) {
		recommendations.push("Design data schema changes");
		recommendations.push("Plan data migration if needed");
	}

	return recommendations;
}

// Improvement Agent Tools - Focus on optimization and technical debt
export const createImprovementAgentTools = (client: LinearClient) => ({
	// Core improvement tools
	comment: withErrorHandling(
		createCommentTool(client, "Improvement Bot"),
		"Failed to add comment",
	),
	analyzeImprovement: withErrorHandling(
		{
			description:
				"Analyze improvement request and provide structured analysis",
			schema: z.object({
				issueId: z.string(),
				description: z.string(),
				currentMetrics: z.record(z.string(), z.number()).optional(),
				targetMetrics: z.record(z.string(), z.number()).optional(),
			}),
			invoke: async ({
				issueId,
				description,
				currentMetrics,
				targetMetrics,
			}) => {
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Extract key information from description
				const analysis = {
					type: description.toLowerCase().includes("performance")
						? "performance"
						: description.toLowerCase().includes("security")
							? "security"
							: description.toLowerCase().includes("maintainability")
								? "maintainability"
								: "technical-debt",
					scope: description.toLowerCase().includes("system-wide")
						? "system-wide"
						: description.toLowerCase().includes("component")
							? "component"
							: "localized",
					hasCurrentMetrics: !!currentMetrics,
					hasTargetMetrics: !!targetMetrics,
					impactedAreas: extractImprovementAreas(description),
				};

				// Update issue with labels based on analysis
				const labels = await client.issueLabels();
				const typeLabel = labels.nodes.find(
					(l) => l.name === `type:${analysis.type}`,
				);
				const scopeLabel = labels.nodes.find(
					(l) => l.name === `scope:${analysis.scope}`,
				);

				await issue.update({
					labelIds: [typeLabel?.id, scopeLabel?.id].filter(
						(id): id is string => id !== undefined,
					),
				});

				return {
					analysis,
					recommendations: [
						analysis.hasCurrentMetrics
							? "Current metrics provided"
							: "Define current performance metrics",
						analysis.hasTargetMetrics
							? "Target metrics defined"
							: "Set target performance goals",
						...generateImprovementRecommendations(analysis),
					],
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to analyze improvement",
	),
	updatePriority: withErrorHandling(
		{
			description: "Update improvement priority based on impact and effort",
			schema: z.object({
				issueId: z.string(),
				technicalImpact: z.enum(["critical", "high", "medium", "low"]),
				implementationRisk: z.enum(["high", "medium", "low"]),
				reason: z.string(),
			}),
			invoke: async ({
				issueId,
				technicalImpact,
				implementationRisk,
				reason,
			}) => {
				const issue = await client.issue(issueId);
				if (!issue) {
					throw new Error(`Issue ${issueId} not found`);
				}

				// Calculate priority (1-4, where 1 is highest)
				const priorityMatrix: Record<string, Record<string, number>> = {
					critical: { low: 1, medium: 1, high: 2 },
					high: { low: 1, medium: 2, high: 3 },
					medium: { low: 2, medium: 3, high: 3 },
					low: { low: 3, medium: 3, high: 4 },
				};

				const priority =
					priorityMatrix[technicalImpact]?.[implementationRisk] ?? 3;

				// Update issue priority
				await issue.update({ priority });

				// Add comment explaining priority
				await createCommentTool(client, "Improvement Bot").invoke({
					issueId,
					content: `Priority updated to P${priority}\nTechnical Impact: ${technicalImpact}\nImplementation Risk: ${implementationRisk}\nReason: ${reason}`,
				});

				return {
					newPriority: priority,
					technicalImpact,
					implementationRisk,
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to update priority",
	),
	analyzePerformance: withErrorHandling(
		{
			description: "Analyze performance metrics and suggest improvements",
			schema: z.object({
				metrics: z.record(z.string(), z.number()),
				thresholds: z.record(z.string(), z.number()),
				context: z.string().optional(),
			}),
			invoke: async ({
				metrics,
				thresholds,
				context,
			}: {
				metrics: Record<string, number>;
				thresholds: Record<string, number>;
				context?: string;
			}) => {
				// Use context to determine metric importance and additional recommendations
				const contextLower = (context || "").toLowerCase();
				const isUserFacing =
					contextLower.includes("user") || contextLower.includes("customer");
				const isHighTraffic =
					contextLower.includes("high traffic") ||
					contextLower.includes("production");
				const isResourceConstrained =
					contextLower.includes("mobile") ||
					contextLower.includes("limited resources");

				const analysis = Object.entries(metrics).map(([metric, value]) => {
					const threshold = thresholds[metric] || 0;
					const numericValue = typeof value === "number" ? value : 0;
					const status =
						numericValue > threshold
							? "exceeds"
							: numericValue === threshold
								? "meets"
								: "below";
					const improvement =
						numericValue > threshold ? "optimize" : "maintain";

					// Determine metric criticality based on context
					const isCritical =
						(isUserFacing && metric.includes("latency")) ||
						(isHighTraffic && metric.includes("throughput")) ||
						(isResourceConstrained &&
							(metric.includes("memory") || metric.includes("cpu")));

					return {
						metric,
						currentValue: numericValue,
						threshold,
						status,
						improvement,
						critical: isCritical,
					};
				});

				// Generate context-aware recommendations
				const recommendations = analysis.map(({ metric, status, critical }) => {
					const criticalPrefix = critical ? "[CRITICAL] " : "";
					if (status === "exceeds") {
						return `${criticalPrefix}Optimize ${metric} - currently exceeding threshold${critical ? " - high priority" : ""}`;
					}
					if (status === "below") {
						return `${criticalPrefix}Improve ${metric} - currently below threshold${critical ? " - high priority" : ""}`;
					}
					return `${criticalPrefix}Maintain ${metric} - meeting threshold`;
				});

				// Add context-specific recommendations
				if (isUserFacing) {
					recommendations.push("Monitor user experience metrics");
					recommendations.push("Set up real user monitoring (RUM)");
				}
				if (isHighTraffic) {
					recommendations.push("Implement caching strategies");
					recommendations.push("Consider load balancing");
				}
				if (isResourceConstrained) {
					recommendations.push("Optimize resource usage");
					recommendations.push("Implement lazy loading where applicable");
				}

				return {
					analysis,
					recommendations,
					summary: `${analysis.filter((a) => a.status === "exceeds").length} metrics exceeding thresholds,
						${analysis.filter((a) => a.status === "below").length} metrics below thresholds,
						${analysis.filter((a) => a.critical).length} critical metrics requiring attention`,
					context: {
						isUserFacing,
						isHighTraffic,
						isResourceConstrained,
					},
				};
			},
			executeAsStep: true,
		} as ExtendedWorkflowTool,
		"Failed to analyze performance",
	),
	// Research tools for additional context
	search: makeExecutableStep(new DuckDuckGoSearch()),
});

// Helper functions for improvement analysis
function extractImprovementAreas(description: string): string[] {
	const areas = [];
	const lowerDesc = description.toLowerCase();

	if (lowerDesc.includes("performance") || lowerDesc.includes("speed")) {
		areas.push("performance");
	}
	if (lowerDesc.includes("memory") || lowerDesc.includes("resource")) {
		areas.push("resource-usage");
	}
	if (
		lowerDesc.includes("maintainability") ||
		lowerDesc.includes("code quality")
	) {
		areas.push("maintainability");
	}
	if (lowerDesc.includes("security") || lowerDesc.includes("vulnerability")) {
		areas.push("security");
	}
	if (lowerDesc.includes("scalability") || lowerDesc.includes("scale")) {
		areas.push("scalability");
	}
	if (lowerDesc.includes("reliability") || lowerDesc.includes("stability")) {
		areas.push("reliability");
	}

	return areas;
}

interface ImprovementAnalysis {
	type: string;
	scope: string;
	hasCurrentMetrics: boolean;
	hasTargetMetrics: boolean;
	impactedAreas: string[];
}

function generateImprovementRecommendations(
	analysis: ImprovementAnalysis,
): string[] {
	const recommendations: string[] = [];

	if (analysis.type === "performance") {
		recommendations.push("Profile current performance bottlenecks");
		recommendations.push("Set up performance monitoring");
	}

	if (analysis.type === "security") {
		recommendations.push("Conduct security audit");
		recommendations.push("Review security best practices");
	}

	if (analysis.type === "maintainability") {
		recommendations.push("Review code complexity metrics");
		recommendations.push("Identify refactoring opportunities");
	}

	if (analysis.impactedAreas.includes("resource-usage")) {
		recommendations.push("Monitor resource utilization");
		recommendations.push("Identify optimization opportunities");
	}

	if (analysis.impactedAreas.includes("scalability")) {
		recommendations.push("Review scaling bottlenecks");
		recommendations.push("Plan capacity improvements");
	}

	return recommendations;
}

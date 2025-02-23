import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { LinearClient } from "@linear/sdk";
import type { Env } from "../index";
import { AgentType } from "../types";
import {
	createCodeAnalysisTool,
	createCommentTool,
	createDependencyAnalysisTool,
	createPriorityAssessmentTool,
	createRequirementsAnalysisTool,
	createSecurityAnalysisTool,
} from "./tools";

// Specialized tools for each agent type
const createManagerTools = (client: LinearClient) => ({
	comment: createCommentTool(client, "Manager Bot"),
	analyze: createRequirementsAnalysisTool(),
	priority: createPriorityAssessmentTool(client),
});

const createBugTools = (client: LinearClient) => ({
	comment: createCommentTool(client, "Bug Bot"),
	analyze: createRequirementsAnalysisTool(),
	codeAnalysis: createCodeAnalysisTool(),
	security: createSecurityAnalysisTool(),
	priority: createPriorityAssessmentTool(client),
	// Bug-specific tools
	stackOverflow: new WikipediaQueryRun({
		topKResults: 3,
		maxDocContentLength: 1000,
	}),
});

const createFeatureTools = (client: LinearClient) => ({
	comment: createCommentTool(client, "Feature Bot"),
	analyze: createRequirementsAnalysisTool(),
	dependency: createDependencyAnalysisTool(),
	// Feature-specific tools
	productHunt: new WikipediaQueryRun({
		topKResults: 3,
		maxDocContentLength: 1000,
	}),
	competitorResearch: new WikipediaQueryRun({
		topKResults: 5,
		maxDocContentLength: 1500,
	}),
	userFeedback: new WikipediaQueryRun({
		topKResults: 3,
		maxDocContentLength: 1000,
	}),
});

const createImprovementTools = (client: LinearClient) => ({
	comment: createCommentTool(client, "Improvement Bot"),
	analyze: createRequirementsAnalysisTool(),
	codeAnalysis: createCodeAnalysisTool(),
	security: createSecurityAnalysisTool(),
	dependency: createDependencyAnalysisTool(),
	// Improvement-specific tools
	performanceMetrics: new WikipediaQueryRun({
		topKResults: 3,
		maxDocContentLength: 1000,
	}),
	techDebtAnalysis: new WikipediaQueryRun({
		topKResults: 3,
		maxDocContentLength: 1000,
	}),
});

// Specialized instructions for each agent type
const createManagerInstructions = () => `
As Manager Bot, you are responsible for:
- Validating and assigning issues to the right specialized agent
- Setting initial priorities
- Ensuring proper issue categorization
- Coordinating between different agents when needed

Available tools:
1. comment - Add comments to issues
2. analyze - Initial requirements analysis
3. priority - Set and manage issue priorities

Best practices:
- Always validate labels before assignment
- Set clear expectations in comments
- Consider team workload in assignments
`;

const createBugInstructions = () => `
As Bug Bot, you specialize in:
- Analyzing and triaging bug reports
- Identifying root causes
- Assessing security implications
- Finding similar issues and solutions

Specialized tools:
1. codeAnalysis - Analyze code for issues
2. security - Assess security implications
3. stackOverflow - Search for similar issues
4. githubIssues - Check for related GitHub issues

Investigation process:
1. Analyze error patterns
2. Check for security implications
3. Search for similar issues
4. Provide reproduction steps
5. Suggest potential fixes
`;

const createFeatureInstructions = () => `
As Feature Bot, you specialize in:
- Analyzing feature requests
- Market and competitor research
- User feedback analysis
- Implementation feasibility

Specialized tools:
1. productHunt - Research similar products
2. competitorResearch - Analyze competitor features
3. userFeedback - Analyze user sentiment and needs
4. dependency - Assess implementation dependencies

Analysis process:
1. Research market solutions
2. Analyze user needs
3. Assess technical feasibility
4. Provide implementation recommendations
5. Consider business impact
`;

const createImprovementInstructions = () => `
As Improvement Bot, you specialize in:
- Technical optimization
- Performance analysis
- Technical debt assessment
- System architecture improvements

Specialized tools:
1. performanceMetrics - Analyze system performance
2. techDebtAnalysis - Assess technical debt
3. codeAnalysis - Review code quality
4. dependency - Evaluate dependencies

Analysis process:
1. Measure current performance
2. Identify technical debt
3. Analyze improvement impact
4. Propose optimization strategy
5. Consider migration needs
`;

// Main utility functions
export const createAgentTools = (
	client: LinearClient,
	agentType: AgentType,
) => {
	switch (agentType) {
		case AgentType.Manager:
			return createManagerTools(client);
		case AgentType.Bug:
			return createBugTools(client);
		case AgentType.Feature:
			return createFeatureTools(client);
		case AgentType.Improvement:
			return createImprovementTools(client);
		default:
			throw new Error(`Unknown agent type: ${agentType}`);
	}
};

export const createAgentInstructions = (agentType: AgentType) => {
	switch (agentType) {
		case AgentType.Manager:
			return createManagerInstructions();
		case AgentType.Bug:
			return createBugInstructions();
		case AgentType.Feature:
			return createFeatureInstructions();
		case AgentType.Improvement:
			return createImprovementInstructions();
		default:
			throw new Error(`Unknown agent type: ${agentType}`);
	}
};

// Environment validation
export const validateEnv = (env: Record<string, string | undefined>): Env => {
	const required = [
		"LINEAR_WEBHOOK_SECRET",
		"MANAGER_API_KEY",
		"BUG_API_KEY",
		"FEATURE_API_KEY",
		"IMPROVEMENT_API_KEY",
	];

	const missing = required.filter((key) => !env[key]);
	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variables: ${missing.join(", ")}`,
		);
	}

	// After validation, we know these exist
	return {
		upstashRedisUrl: env.UPSTASH_REDIS_URL as string,
		upstashRedisToken: env.UPSTASH_REDIS_TOKEN as string,
		linearWebhookSecret: env.LINEAR_WEBHOOK_SECRET as string,
		managerApiKey: env.MANAGER_API_KEY as string,
		bugApiKey: env.BUG_API_KEY as string,
		featureApiKey: env.FEATURE_API_KEY as string,
		improvementApiKey: env.IMPROVEMENT_API_KEY as string,
	};
};

// Linear client initialization
export const initializeLinearClient = (
	apiKey: string | undefined,
	role: string,
): LinearClient => {
	if (!apiKey) {
		throw new Error(`Missing API key for ${role} role`);
	}
	try {
		return new LinearClient({ apiKey });
	} catch (error) {
		throw new Error(`Failed to initialize Linear client for ${role}: ${error}`);
	}
};

export const getApiKeyForAgent = (env: Env, agentType: AgentType): string => {
	switch (agentType) {
		case AgentType.Manager:
			return env.managerApiKey;
		case AgentType.Bug:
			return env.bugApiKey;
		case AgentType.Feature:
			return env.featureApiKey;
		case AgentType.Improvement:
			return env.improvementApiKey;
		default:
			throw new Error(`Unknown agent type: ${agentType}`);
	}
};

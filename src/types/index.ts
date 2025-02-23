import type { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import type { LinearClient } from "@linear/sdk";
import type { WorkflowTool } from "@upstash/workflow";

export enum AgentType {
	Manager = "manager",
	Bug = "bug",
	Feature = "feature",
	Improvement = "improvement",
}

export enum LinearLabel {
	Bug = "Bug",
	Feature = "Feature",
	Improvement = "Improvement",
}

export interface AgentConfig {
	type: AgentType;
	apiKey: string;
	name: string;
}

export interface LinearWebhookPayload {
	action: string;
	data: {
		id: string;
		title: string;
		description: string;
		labels: {
			nodes: Array<{
				name: string;
			}>;
		};
	};
	type: string;
}

export type SecuritySeverity = "low" | "medium" | "high" | "critical";
export type IssueType = "bug" | "feature" | "improvement";

export interface CodeAnalysisResult {
	issues: string[];
	complexity: string;
	suggestions: string[];
}

export interface SecurityAnalysisResult {
	risks: string[];
	recommendations: string[];
	severity: SecuritySeverity;
}

export interface RequirementsAnalysisResult {
	analysis: string;
	complexity: string;
	estimatedEffort: string;
}

export interface PriorityAssessmentResult {
	newPriority: number;
	impact: SecuritySeverity;
	urgency: SecuritySeverity;
}

// Upstash Workflow Types
export interface WorkflowContext {
	agents: {
		openai: (model: string) => OpenaiModel;
		agent: (config: WorkflowAgentConfig) => WorkflowAgent;
		task: (config: WorkflowTaskConfig) => WorkflowTask;
	};
	env: Record<string, string | undefined>;
}

export interface OpenaiModel {
	id: string;
	name: string;
	maxTokens: number;
}

export interface WorkflowAgent {
	id: string;
	name: string;
	run: (input: string) => Promise<{ text: string }>;
}

export interface WorkflowTask {
	id: string;
	run: () => Promise<{ text: string }>;
}

export interface WorkflowAgentConfig {
	model: OpenaiModel;
	name: string;
	tools: Record<string, WorkflowTool | WikipediaQueryRun>;
	maxSteps: number;
	background: string;
}

export interface WorkflowTaskConfig {
	model: OpenaiModel;
	prompt: string;
	agents: WorkflowAgent[];
	maxSteps: number;
}

// Linear Client Types
export interface LinearClientConfig {
	apiKey: string;
}

export interface LinearIssueUpdate {
	priority?: number;
	status?: string;
	assigneeId?: string;
}

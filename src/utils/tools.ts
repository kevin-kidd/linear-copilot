import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import type { LinearClient } from "@linear/sdk";
import { WorkflowTool } from "@upstash/workflow";
import { z } from "zod";

// Define tool schemas
const commentSchema = z.object({
	issueId: z.string(),
	content: z.string(),
});

const analysisSchema = z.object({
	description: z.string(),
	type: z.enum(["bug", "feature", "improvement"]),
});

const codeAnalysisSchema = z.object({
	repository: z.string(),
	filePath: z.string().optional(),
	content: z.string(),
});

const securitySchema = z.object({
	description: z.string(),
	type: z.enum(["vulnerability", "dependency", "configuration"]),
});

const prioritySchema = z.object({
	issueId: z.string(),
	impact: z.enum(["low", "medium", "high", "critical"]),
	urgency: z.enum(["low", "medium", "high", "critical"]),
});

const dependencySchema = z.object({
	packageJson: z.string(),
	type: z.enum(["direct", "all", "dev"]),
});

// Common tool for adding comments to Linear issues
export const createCommentTool = (
	client: LinearClient,
	agentName: string,
): WorkflowTool<typeof commentSchema> =>
	new WorkflowTool<typeof commentSchema>({
		description: "Add a comment to a Linear issue",
		schema: commentSchema,
		invoke: async ({ issueId, content }) => {
			await client.createComment({
				issueId,
				body: `[${agentName}] ${content}`,
			});
			return "Comment added successfully";
		},
	});

// Wikipedia research tool
export const createWikiTool = (): WikipediaQueryRun =>
	new WikipediaQueryRun({
		topKResults: 1,
		maxDocContentLength: 500,
	});

// Tool for analyzing technical requirements
export const createRequirementsAnalysisTool = (): WorkflowTool<
	typeof analysisSchema
> =>
	new WorkflowTool<typeof analysisSchema>({
		description:
			"Analyze technical requirements and provide structured feedback",
		schema: analysisSchema,
		invoke: async ({ description, type }) => {
			// Use description to customize analysis
			const descriptionLower = description.toLowerCase();
			const defaultBugSections = [
				"Root Cause Analysis",
				"Impact Assessment",
				"Reproduction Steps",
				"Potential Fixes",
				"Testing Requirements",
				"Dependencies Affected",
			];

			const aspects = {
				bug: {
					sections: descriptionLower.includes("critical")
						? [
								"Immediate Impact Analysis",
								"Emergency Response Steps",
								"Critical Path Resolution",
								...defaultBugSections,
							]
						: defaultBugSections,
					metrics: {
						severity: ["low", "medium", "high", "critical"],
						scope: ["isolated", "component", "system-wide"],
						reproducibility: ["always", "intermittent", "rare"],
					},
				},
				feature: {
					sections: [
						"Business Requirements",
						"Technical Requirements",
						"User Experience",
						"Implementation Approach",
						"Integration Points",
						"Testing Strategy",
						"Performance Considerations",
						"Security Implications",
					],
					metrics: {
						complexity: ["low", "medium", "high"],
						impact: ["minimal", "moderate", "significant"],
						userValue: ["low", "medium", "high"],
					},
				},
				improvement: {
					sections: [
						"Current State Analysis",
						"Pain Points",
						"Proposed Changes",
						"Expected Benefits",
						"Migration Strategy",
						"Rollback Plan",
						"Performance Impact",
					],
					metrics: {
						effort: ["small", "medium", "large"],
						risk: ["low", "medium", "high"],
						technicalDebt: ["reduces", "neutral", "increases"],
					},
				},
			};

			const typeAspects = aspects[type];
			const analysisPoints = typeAspects.sections
				.map((section) => `### ${section}\n- Needs detailed assessment`)
				.join("\n\n");

			// Calculate complexity based on number of sections and metrics
			const complexity =
				typeAspects.sections.length > 6
					? "high"
					: typeAspects.sections.length > 4
						? "medium"
						: "low";

			// Estimate effort based on complexity and type
			const effortMatrix = {
				high: {
					bug: "3-5 days",
					feature: "2-3 weeks",
					improvement: "1-2 weeks",
				},
				medium: {
					bug: "1-2 days",
					feature: "1-2 weeks",
					improvement: "3-5 days",
				},
				low: { bug: "4-8 hours", feature: "2-3 days", improvement: "1-2 days" },
			};

			return {
				analysis: `# ${
					type.charAt(0).toUpperCase() + type.slice(1)
				} Analysis\n\n${analysisPoints}`,
				complexity,
				estimatedEffort: effortMatrix[complexity][type],
				metrics: typeAspects.metrics,
			};
		},
	});

// Tool for code analysis
export const createCodeAnalysisTool = (): WorkflowTool<
	typeof codeAnalysisSchema
> =>
	new WorkflowTool<typeof codeAnalysisSchema>({
		description:
			"Analyze code for potential issues, patterns, and improvements",
		schema: codeAnalysisSchema,
		invoke: async ({ content, repository, filePath }) => {
			// Use repository and filePath in analysis
			const context = `${repository}${filePath ? `/${filePath}` : ""}`;
			console.warn(`Analyzing code in ${context}`);

			// Enhanced analysis categories
			const analysisCategories = {
				syntax: {
					description: "Code structure and formatting",
					patterns: [
						{
							regex: /console\.(log|debug|info)/g,
							issue: "Remove debug logging statements",
						},
						{ regex: /TODO|FIXME/g, issue: "Address TODO comments" },
						{
							regex: /catch\s*\(\s*\w+\s*\)\s*{}/g,
							issue: "Empty catch block",
						},
					],
				},
				security: {
					description: "Security concerns",
					patterns: [
						{ regex: /eval\s*\(/g, issue: "Avoid using eval()" },
						{
							regex: /process\.env/g,
							issue: "Ensure environment variables are validated",
						},
						{
							regex: /new\s+Function\s*\(/g,
							issue: "Avoid using new Function()",
						},
					],
				},
				performance: {
					description: "Performance considerations",
					patterns: [
						{
							regex: /\.forEach|\.map|\.filter/g,
							issue: "Consider performance impact of array operations",
						},
						{
							regex: /async\s+function|\basync\b/g,
							issue: "Verify proper async/await usage",
						},
						{
							regex: /new\s+Promise/g,
							issue: "Ensure Promise creation is necessary",
						},
					],
				},
			};

			const issues: string[] = [];
			const suggestions: string[] = [];

			// Analyze code against patterns
			for (const [category, { description, patterns }] of Object.entries(
				analysisCategories,
			)) {
				for (const { regex, issue } of patterns) {
					if (regex.test(content)) {
						issues.push(`[${category}] ${issue}`);
						suggestions.push(
							`Consider addressing ${issue.toLowerCase()} to improve ${description.toLowerCase()}`,
						);
					}
				}
			}

			// Calculate complexity based on various metrics
			const complexityMetrics = {
				length: content.length,
				lines: content.split("\n").length,
				functions: (content.match(/function\s+\w+\s*\(|=>|\basync\b/g) || [])
					.length,
				conditionals: (content.match(/if\s*\(|else|switch|case\s+/g) || [])
					.length,
			};

			const complexity =
				complexityMetrics.functions > 5 || complexityMetrics.conditionals > 10
					? "high"
					: complexityMetrics.functions > 3 ||
							complexityMetrics.conditionals > 5
						? "medium"
						: "low";

			return {
				issues: issues.length > 0 ? issues : ["No major issues detected"],
				complexity,
				suggestions:
					suggestions.length > 0
						? suggestions
						: ["Code appears to follow best practices"],
				metrics: complexityMetrics,
			};
		},
	});

// Tool for security analysis
export const createSecurityAnalysisTool = (): WorkflowTool<
	typeof securitySchema
> =>
	new WorkflowTool<typeof securitySchema>({
		description: "Analyze security implications and potential vulnerabilities",
		schema: securitySchema,
		invoke: async ({ description, type }) => {
			const securityCategories = {
				vulnerability: {
					risks: [
						"Input validation",
						"Authentication bypass",
						"Authorization bypass",
						"Data exposure",
						"Injection attacks",
					],
					recommendations: [
						"Implement input sanitization",
						"Add request validation",
						"Use parameterized queries",
						"Implement rate limiting",
						"Add audit logging",
					],
				},
				dependency: {
					risks: [
						"Outdated dependencies",
						"Known vulnerabilities",
						"License compliance",
						"Supply chain attacks",
						"Breaking changes",
					],
					recommendations: [
						"Regular dependency updates",
						"Vulnerability scanning",
						"Lock file maintenance",
						"Dependency audit",
						"Version pinning",
					],
				},
				configuration: {
					risks: [
						"Sensitive data exposure",
						"Misconfiguration",
						"Default settings",
						"Environment separation",
						"Access control",
					],
					recommendations: [
						"Secret management",
						"Configuration validation",
						"Environment isolation",
						"Access review",
						"Security headers",
					],
				},
			};

			const categoryInfo = securityCategories[type];
			const severityFactors = {
				dataExposure:
					description.includes("sensitive") || description.includes("personal"),
				systemAccess:
					description.includes("admin") || description.includes("root"),
				scope:
					description.includes("all") || description.includes("system-wide"),
			};

			const severity =
				Object.values(severityFactors).filter(Boolean).length >= 2
					? "critical"
					: Object.values(severityFactors).filter(Boolean).length === 1
						? "high"
						: description.length > 500
							? "medium"
							: "low";

			return {
				risks: categoryInfo.risks,
				recommendations: categoryInfo.recommendations,
				severity,
				factors: severityFactors,
			};
		},
	});

// Tool for priority assessment
export const createPriorityAssessmentTool = (
	client: LinearClient,
): WorkflowTool<typeof prioritySchema> =>
	new WorkflowTool<typeof prioritySchema>({
		description: "Assess and set issue priority based on impact and urgency",
		schema: prioritySchema,
		invoke: async ({ issueId, impact, urgency }) => {
			// Calculate priority based on impact and urgency
			const priorityMatrix = {
				critical: { critical: 1, high: 2, medium: 2, low: 3 },
				high: { critical: 2, high: 2, medium: 3, low: 3 },
				medium: { critical: 2, high: 3, medium: 3, low: 4 },
				low: { critical: 3, high: 3, medium: 4, low: 4 },
			};

			const priority = priorityMatrix[impact][urgency];

			// Update issue priority in Linear
			const issue = await client.issue(issueId);
			await issue.update({
				priority,
			});

			return {
				newPriority: priority,
				impact,
				urgency,
			};
		},
	});

// Tool for dependency analysis
export const createDependencyAnalysisTool = (): WorkflowTool<
	typeof dependencySchema
> =>
	new WorkflowTool<typeof dependencySchema>({
		description:
			"Analyze project dependencies for potential issues and updates",
		schema: dependencySchema,
		invoke: async ({ packageJson, type }) => {
			const pkg = JSON.parse(packageJson);
			const dependencies = {
				direct: pkg.dependencies || {},
				dev: pkg.devDependencies || {},
				all: { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) },
			};

			const depsToAnalyze = dependencies[type];
			const results = {
				outdated: [] as string[],
				security: [] as string[],
				recommendations: [] as string[],
				metrics: {
					total: Object.keys(depsToAnalyze).length,
					directDeps: Object.keys(pkg.dependencies || {}).length,
					devDeps: Object.keys(pkg.devDependencies || {}).length,
				},
			};

			// Check for version patterns that might indicate outdated packages
			for (const [dep, version] of Object.entries(depsToAnalyze)) {
				const versionStr = version as string;

				// Check for potentially problematic version patterns
				if (versionStr.startsWith("^") || versionStr.startsWith("~")) {
					results.recommendations.push(
						`Consider pinning ${dep} to exact version for better stability`,
					);
				}

				if (versionStr.includes("alpha") || versionStr.includes("beta")) {
					results.recommendations.push(
						`${dep} is using a pre-release version. Consider using stable release`,
					);
				}

				if (versionStr === "*" || versionStr === "latest") {
					results.security.push(
						`${dep} uses an unpinned version, which is a security risk`,
					);
				}
			}

			// Add general recommendations based on dependency count
			if (results.metrics.total > 50) {
				results.recommendations.push(
					"Consider auditing dependencies to reduce bundle size",
				);
			}

			if (results.metrics.devDeps > results.metrics.directDeps * 2) {
				results.recommendations.push(
					"Large number of dev dependencies. Consider consolidating development tools",
				);
			}

			return {
				...results,
				summary:
					`Analyzed ${results.metrics.total} dependencies:\n` +
					`- Direct dependencies: ${results.metrics.directDeps}\n` +
					`- Dev dependencies: ${results.metrics.devDeps}\n` +
					`- Security concerns: ${results.security.length}\n` +
					`- Recommendations: ${results.recommendations.length}`,
			};
		},
	});

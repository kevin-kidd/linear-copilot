import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { StackExchangeAPI } from "@langchain/community/tools/stackexchange";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import type { WorkflowTool } from "@upstash/workflow";
import { z } from "zod";

const CODE_TYPES = ["backend", "frontend", "library", "cli"] as const;
const CODE_CONCERNS = [
	"security",
	"performance",
	"maintainability",
	"testing",
] as const;

type CodeConcern = (typeof CODE_CONCERNS)[number];

interface DependencyAnalysisResult {
	dependency: string;
	currentVersion: string;
	searchResult: string;
}

// Bug Agent Tools - Focus on technical analysis and research
export const createBugAnalysisTools = () => ({
	// Core analysis tools
	stackOverflow: new StackExchangeAPI({
		maxResult: 3,
		queryType: "all",
		resultSeparator: "\n\n",
	}),
	githubIssues: {
		description: "Search GitHub issues for similar bugs",
		schema: z.object({
			query: z.string(),
			language: z.string().optional(),
			status: z.enum(["open", "closed"]).optional(),
		}),
		invoke: async ({ query, language, status }) => {
			const searchTool = new DuckDuckGoSearch();
			const languageFilter = language ? `language:${language}` : "";
			const statusFilter = status ? `is:${status}` : "";

			const results = await searchTool.invoke(
				`site:github.com ${query} ${languageFilter} ${statusFilter} label:bug`,
			);
			return {
				results,
				source: "GitHub Issues",
				searchQuery: `${query} ${languageFilter} ${statusFilter}`,
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
	errorSearch: {
		description: "Search for specific error messages and solutions",
		schema: z.object({
			errorMessage: z.string(),
			context: z.string().optional(),
			framework: z.string().optional(),
		}),
		invoke: async ({ errorMessage, context, framework }) => {
			const searchTool = new DuckDuckGoSearch();
			const frameworkFilter = framework ? `${framework}` : "";
			const contextFilter = context ? `${context}` : "";

			const results = await Promise.all([
				searchTool.invoke(
					`"${errorMessage}" ${frameworkFilter} ${contextFilter} solution`,
				),
				new StackExchangeAPI({
					maxResult: 2,
					queryType: "all",
					resultSeparator: "\n\n",
				}).invoke(`[${framework || ""}] "${errorMessage}"`),
			]);

			return {
				generalResults: results[0],
				stackOverflow: results[1],
				searchQuery: `${errorMessage} ${frameworkFilter} ${contextFilter}`,
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
});

// Feature Agent Tools - Focus on market and technical research
export const createFeatureResearchTools = () => ({
	// Market research tools
	productHunt: {
		description: "Search ProductHunt for similar products and features",
		schema: z.object({
			query: z.string(),
			category: z.string().optional(),
			timeframe: z.enum(["week", "month", "year", "all"]).optional(),
		}),
		invoke: async ({ query, category, timeframe }) => {
			const searchTool = new DuckDuckGoSearch();
			const categoryFilter = category ? `category:"${category}"` : "";
			const timeFilter = timeframe
				? `after:${getTimeframeDate(timeframe)}`
				: "";

			const results = await searchTool.invoke(
				`site:producthunt.com ${query} ${categoryFilter} ${timeFilter}`,
			);
			return {
				results,
				source: "ProductHunt",
				searchQuery: `${query} ${categoryFilter} ${timeFilter}`,
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
	competitorAnalysis: {
		description: "Research competitors and their feature implementations",
		schema: z.object({
			feature: z.string(),
			competitors: z.array(z.string()),
			includeReviews: z.boolean().optional(),
		}),
		invoke: async ({ feature, competitors, includeReviews }) => {
			const searchTool = new DuckDuckGoSearch();
			const results = await Promise.all([
				...competitors.map((competitor: string) =>
					searchTool.invoke(
						`site:${competitor} ${feature} ${includeReviews ? "review OR rating" : ""}`,
					),
				),
				searchTool.invoke(`${feature} market analysis comparison`),
			]);

			return {
				competitorResults: results.slice(0, -1),
				marketAnalysis: results[results.length - 1],
				competitors,
				feature,
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
	technicalFeasibility: {
		description: "Research technical implementation approaches",
		schema: z.object({
			feature: z.string(),
			technology: z.string().optional(),
			constraints: z.array(z.string()).optional(),
		}),
		invoke: async ({ feature, technology, constraints }) => {
			const searchTool = new DuckDuckGoSearch();
			const constraintsFilter = constraints ? constraints.join(" ") : "";
			const techFilter = technology ? `${technology}` : "";

			const results = await Promise.all([
				searchTool.invoke(
					`${feature} ${techFilter} implementation guide tutorial`,
				),
				searchTool.invoke(
					`${feature} ${techFilter} ${constraintsFilter} technical challenges`,
				),
				new StackExchangeAPI({
					maxResult: 2,
					queryType: "all",
					resultSeparator: "\n\n",
				}).invoke(`[${technology || ""}] ${feature} implementation`),
			]);

			return {
				implementationGuides: results[0],
				technicalChallenges: results[1],
				stackOverflow: results[2],
				searchQuery: `${feature} ${techFilter} ${constraintsFilter}`,
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
});

// Improvement Agent Tools - Focus on technical analysis
export const createImprovementAnalysisTools = () => ({
	// Technical analysis tools
	codeQuality: {
		description: "Analyze code quality and suggest improvements",
		schema: z.object({
			language: z.string(),
			codeType: z.enum(CODE_TYPES).optional(),
			concerns: z.array(z.enum(CODE_CONCERNS)).optional(),
		}),
		invoke: async ({ language, codeType, concerns }) => {
			const searchTool = new DuckDuckGoSearch();
			const stackExchange = new StackExchangeAPI({
				maxResult: 2,
				queryType: "all",
				resultSeparator: "\n\n",
			});

			// Build focused search queries
			const queries = [
				// Core best practices
				`${language} coding standards best practices patterns`,
				// Type-specific practices
				...(codeType
					? [`${language} ${codeType} architecture patterns best practices`]
					: []),
				// Concern-specific practices
				...(concerns?.map(
					(concern: CodeConcern) =>
						`${language} ${concern} best practices patterns`,
				) || []),
			];

			// Execute searches in parallel
			const results = await Promise.all([
				...queries.map((query) => searchTool.invoke(query)),
				stackExchange.invoke(`[${language}] code quality best practices`),
			]);

			// Generate recommendations based on language and context
			const recommendations = [
				...generateLanguageSpecificRecommendations(language),
				...(codeType ? generateTypeSpecificRecommendations(codeType) : []),
				...(concerns?.flatMap((concern: CodeConcern) =>
					generateConcernSpecificRecommendations(concern),
				) || []),
			];

			return {
				bestPractices: results.slice(0, -1), // All DuckDuckGo results
				communityGuidelines: results[results.length - 1], // Stack Exchange result
				recommendations,
				context: {
					language,
					codeType,
					concerns,
				},
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
	dependencyAnalysis: {
		description: "Analyze project dependencies and suggest updates",
		schema: z.object({
			dependencies: z.record(z.string(), z.string()),
			ecosystem: z.string(),
		}),
		invoke: async ({ dependencies, ecosystem }) => {
			const searchTool = new DuckDuckGoSearch();
			const results = await Promise.all(
				Object.entries(dependencies).map(async ([dep, version]) => {
					const searchResult = await searchTool.invoke(
						`${ecosystem} ${dep} latest version changelog breaking changes`,
					);
					return {
						dependency: dep,
						currentVersion: String(version),
						searchResult: String(searchResult),
					} satisfies DependencyAnalysisResult;
				}),
			);

			return {
				analysis: results,
				recommendations: generateDependencyRecommendations(results),
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
	performanceAnalysis: {
		description: "Analyze performance bottlenecks and suggest optimizations",
		schema: z.object({
			metrics: z.record(z.string(), z.number()),
			context: z.string().optional(),
			technology: z.string().optional(),
		}),
		invoke: async ({ metrics, context, technology }) => {
			const searchTool = new DuckDuckGoSearch();
			const contextFilter = context ? `${context}` : "";
			const techFilter = technology ? `${technology}` : "";

			const results = await Promise.all([
				searchTool.invoke(
					`${techFilter} performance optimization techniques ${contextFilter}`,
				),
				searchTool.invoke(
					`${techFilter} performance benchmarks standards ${contextFilter}`,
				),
				new StackExchangeAPI({
					maxResult: 2,
					queryType: "all",
					resultSeparator: "\n\n",
				}).invoke(
					`[${technology || ""}] performance optimization ${contextFilter}`,
				),
			]);

			return {
				optimizationTechniques: results[0],
				benchmarks: results[1],
				communityInsights: results[2],
				recommendations: generatePerformanceRecommendations(metrics, context),
			};
		},
		executeAsStep: true,
	} as WorkflowTool,
});

// Helper functions
function getTimeframeDate(timeframe: string): string {
	const now = new Date();
	switch (timeframe) {
		case "week":
			now.setDate(now.getDate() - 7);
			break;
		case "month":
			now.setMonth(now.getMonth() - 1);
			break;
		case "year":
			now.setFullYear(now.getFullYear() - 1);
			break;
		default:
			return "";
	}
	return now.toISOString().split("T")[0];
}

function generateDependencyRecommendations(
	results: DependencyAnalysisResult[],
): string[] {
	const recommendations = [];

	for (const result of results) {
		if (result.searchResult.toLowerCase().includes("security")) {
			recommendations.push(
				`Update ${result.dependency} - security updates available`,
			);
		}
		if (result.searchResult.toLowerCase().includes("deprecated")) {
			recommendations.push(
				`Replace ${result.dependency} - package is deprecated`,
			);
		}
		if (result.searchResult.toLowerCase().includes("breaking changes")) {
			recommendations.push(
				`Review ${result.dependency} update - contains breaking changes`,
			);
		}
	}

	return recommendations;
}

function generatePerformanceRecommendations(
	metrics: Record<string, number>,
	context?: string,
): string[] {
	const recommendations = [];

	for (const [metric, value] of Object.entries(metrics)) {
		if (metric.includes("latency") && value > 1000) {
			recommendations.push("Optimize response times");
			recommendations.push("Implement caching layer");
		}
		if (metric.includes("memory") && value > 80) {
			recommendations.push("Optimize memory usage");
			recommendations.push("Implement memory limits");
		}
		if (metric.includes("cpu") && value > 70) {
			recommendations.push("Optimize CPU-intensive operations");
			recommendations.push("Consider async processing");
		}
	}

	if (context?.includes("web")) {
		recommendations.push("Optimize asset loading");
		recommendations.push("Implement code splitting");
	}

	if (context?.includes("mobile")) {
		recommendations.push("Optimize battery usage");
		recommendations.push("Implement offline capabilities");
	}

	return recommendations;
}

// Add new helper functions for code quality recommendations
function generateLanguageSpecificRecommendations(language: string): string[] {
	const commonRecommendations = [
		"Follow consistent code formatting",
		"Use meaningful variable and function names",
		"Add comprehensive documentation",
		"Implement proper error handling",
		"Write unit tests for critical paths",
	];

	const languageSpecific: Record<string, string[]> = {
		typescript: [
			"Use strict TypeScript configuration",
			"Leverage type inference where possible",
			"Define explicit return types for functions",
			"Use interfaces for complex objects",
			"Enable strict null checks",
		],
		python: [
			"Follow PEP 8 style guide",
			"Use type hints for better maintainability",
			"Implement docstring documentation",
			"Use virtual environments",
			"Leverage list comprehensions appropriately",
		],
		javascript: [
			"Use ESLint for code quality",
			"Implement proper async/await error handling",
			"Use modern ES6+ features",
			"Consider TypeScript for large projects",
			"Use strict mode",
		],
		java: [
			"Follow Java naming conventions",
			"Use appropriate access modifiers",
			"Implement proper exception handling",
			"Use dependency injection",
			"Follow SOLID principles",
		],
		// Add more languages as needed
	};

	return [
		...commonRecommendations,
		...(languageSpecific[language.toLowerCase()] || []),
	];
}

function generateTypeSpecificRecommendations(codeType: string): string[] {
	const recommendations: Record<string, string[]> = {
		backend: [
			"Implement proper API versioning",
			"Use middleware for cross-cutting concerns",
			"Implement proper request validation",
			"Use connection pooling for databases",
			"Implement proper logging and monitoring",
		],
		frontend: [
			"Implement proper state management",
			"Use component composition",
			"Implement proper error boundaries",
			"Optimize bundle size",
			"Implement proper loading states",
		],
		library: [
			"Provide comprehensive documentation",
			"Implement proper versioning",
			"Minimize dependencies",
			"Provide TypeScript types",
			"Follow semantic versioning",
		],
		cli: [
			"Implement proper argument parsing",
			"Provide helpful error messages",
			"Implement proper logging levels",
			"Add progress indicators for long operations",
			"Implement proper signal handling",
		],
	};

	return recommendations[codeType] || [];
}

function generateConcernSpecificRecommendations(
	concern: CodeConcern,
): string[] {
	const recommendations: Record<CodeConcern, string[]> = {
		security: [
			"Implement input validation",
			"Use parameterized queries",
			"Implement proper authentication/authorization",
			"Sanitize user input",
			"Use secure dependencies",
		],
		performance: [
			"Implement caching where appropriate",
			"Optimize database queries",
			"Use appropriate data structures",
			"Implement proper indexing",
			"Profile critical code paths",
		],
		maintainability: [
			"Follow SOLID principles",
			"Keep functions small and focused",
			"Use dependency injection",
			"Implement proper logging",
			"Use design patterns appropriately",
		],
		testing: [
			"Write unit tests for critical paths",
			"Implement integration tests",
			"Use test doubles appropriately",
			"Follow test pyramid principles",
			"Implement proper test coverage",
		],
	};

	return recommendations[concern] || [];
}

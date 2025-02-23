# Linear Copilot 🤖

An intelligent issue analysis system that automatically processes Linear issues using specialized AI agents. Built with Upstash Workflow and Cloudflare Workers, it provides deep insights, technical analysis, and smart prioritization for your Linear issues.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![Linear SDK](https://img.shields.io/badge/Linear_SDK-v38-blue)](https://developers.linear.app/)
[![Upstash](https://img.shields.io/badge/Upstash-Workflow-purple)](https://upstash.com/)
[![Code Style: Biome](https://img.shields.io/badge/Code_Style-Biome-blue)](https://biomejs.dev/)

## 📑 Table of Contents

- [✨ Features](#-features)
- [🚀 Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Development](#development)
  - [Deployment](#deployment)
  - [Linear Webhook Setup](#linear-webhook-setup)
- [🔧 Architecture](#-architecture)
  - [Agent System](#agent-system)
  - [Analysis Tools](#analysis-tools)
  - [Technology Stack](#technology-stack)
  - [Workflow Steps](#workflow-steps)
  - [Error Handling](#error-handling)
- [📝 Usage](#-usage)
  - [Example Workflow](#example-workflow)
- [🔒 Security](#-security)
- [🚨 Error Handling](#-error-handling)
- [🤝 Contributing](#-contributing)
- [📜 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)
- [📫 Support](#-support)

## ✨ Features

- 🤖 **Multi-Agent System** - Specialized agents for different types of analysis:
  - Manager Agent - Orchestrates task distribution and workflow coordination
  - Bug Agent - Deep analysis of bug reports with automatic research
  - Feature Agent - Market research and technical feasibility analysis
  - Improvement Agent - Technical debt and performance optimization analysis

- 🔍 **Intelligent Analysis Tools**
  - Code Quality Analysis - Evaluates code patterns and suggests improvements
  - Performance Analysis - Analyzes metrics and provides optimization recommendations
  - Dependency Analysis - Checks for updates, security issues, and breaking changes
  - Security Analysis - Identifies potential vulnerabilities and security implications
  - Market Research - Evaluates similar products and features (via ProductHunt)
  - Technical Feasibility - Assesses implementation approaches and challenges

- 🎯 **Smart Prioritization**
  - Context-aware priority assessment
  - Impact and effort-based scoring
  - Automatic priority updates with detailed explanations

- 🔗 **Integrated Research**
  - Stack Overflow integration for technical solutions
  - GitHub Issues search for similar problems
  - DuckDuckGo search for broad context gathering
  - Competitor analysis for feature research

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (Cloudflare Workers CLI)
- Linear account with API access
- Upstash account with Workflow access

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/linear-copilot.git
   cd linear-copilot
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a development environment file:

   ```bash
   cp wrangler.example.toml wrangler.toml
   ```

4. Configure your development environment in `.dev.vars`:

   ```env
   # Linear API Keys
   MANAGER_API_KEY=your_manager_api_key
   BUG_API_KEY=your_bug_api_key
   FEATURE_API_KEY=your_feature_api_key
   IMPROVEMENT_API_KEY=your_improvement_api_key

   # Linear Webhook Configuration
   LINEAR_WEBHOOK_SECRET=your_webhook_secret

   # Upstash Configuration
   UPSTASH_REDIS_URL=your_redis_url
   UPSTASH_REDIS_TOKEN=your_redis_token
   ```

### Development

1. Start the development server:

   ```bash
   npm run dev
   ```

2. For local webhook testing, use a tool like [ngrok](https://ngrok.com/):

   ```bash
   ngrok http 8787
   ```

### Deployment

1. Login to Cloudflare:

   ```bash
   npx wrangler login
   ```

2. Configure your production secrets:

   ```bash
   npx wrangler secret put MANAGER_API_KEY
   npx wrangler secret put BUG_API_KEY
   npx wrangler secret put FEATURE_API_KEY
   npx wrangler secret put IMPROVEMENT_API_KEY
   npx wrangler secret put LINEAR_WEBHOOK_SECRET
   npx wrangler secret put UPSTASH_REDIS_URL
   npx wrangler secret put UPSTASH_REDIS_TOKEN
   ```

3. Deploy to Cloudflare Workers:

   ```bash
   npm run deploy
   ```

4. Your webhook endpoint will be available at:

   ```bash
   https://<your-worker>.<your-subdomain>.workers.dev/
   ```

### Linear Webhook Setup

1. Go to your Linear workspace settings
2. Navigate to "Webhooks" and click "New Webhook"
3. Enter your Cloudflare Worker URL
4. Select the following events:
   - Issue: Created
   - Issue: Updated (for label changes)
5. Save the webhook and copy the secret
6. Update your `LINEAR_WEBHOOK_SECRET` environment variable

## 🔧 Architecture

### Agent System

The system uses a multi-agent architecture where each agent is specialized in analyzing different aspects of issues:

- **Manager Agent**: Routes issues to appropriate specialized agents and coordinates workflow
- **Bug Agent**: Analyzes bug reports, searches for similar issues, and provides solution recommendations
- **Feature Agent**: Evaluates feature requests, performs market research, and assesses technical feasibility
- **Improvement Agent**: Analyzes technical improvements, performance metrics, and provides optimization recommendations

### Analysis Tools

Each agent has access to specialized tools based on their focus:

#### Bug Agent Tools

- Error Analysis - Searches for similar issues and solutions
- Stack Overflow Integration - Finds technical solutions and workarounds
- GitHub Issues Search - Identifies similar bug reports and fixes
- Code Quality Analysis - Examines potential code-related causes

#### Feature Agent Tools

- Market Research - Evaluates similar products via ProductHunt
- Competitor Analysis - Researches competitor implementations
- Technical Feasibility - Assesses implementation approaches
- Requirements Analysis - Evaluates feature scope and impact

#### Improvement Agent Tools

- Performance Analysis - Evaluates metrics and suggests optimizations
- Code Quality Assessment - Analyzes maintainability and patterns
- Dependency Analysis - Checks for updates and security issues
- Technical Debt Evaluation - Assesses improvement impact

### Technology Stack

- [Upstash Workflow](https://upstash.com/docs/workflow/overview) - Serverless task orchestration
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge computing platform
- [Linear SDK](https://developers.linear.app/docs/sdk/getting-started) - Issue tracking integration
- [TypeScript](https://www.typescriptlang.org/) - Type-safe development

### Workflow Steps

The system processes Linear webhooks through distinct workflow steps:

1. **Webhook Validation**
   - Validates webhook signatures and request integrity
   - Verifies IP addresses against allowed list
   - Checks webhook timestamp freshness
   - Validates event types (issue creation/label updates)

2. **Client Initialization**
   - Sets up Linear clients for each agent type
   - Validates API keys and connections
   - Handles client initialization errors

3. **Issue Processing**
   - Manager Agent evaluates and routes issues
   - Specialized agents (Bug, Feature, Improvement) perform analysis
   - Agents use their specific toolsets for deep analysis
   - Results are posted back to Linear as comments

### Error Handling

The system implements comprehensive error handling at each step:

- **Webhook Validation**
  - Signature verification
  - IP allowlist checking
  - Timestamp validation
  - Event type verification

- **Client Operations**
  - API key validation
  - Connection error handling
  - Rate limit management

- **Agent Processing**
  - Task execution monitoring
  - Error reporting via Linear comments
  - Graceful failure handling

## 📝 Usage

The system automatically processes issues when:

1. A new issue is created in Linear
2. An issue's labels are updated

The appropriate agent will:

1. Analyze the issue based on its type (bug, feature, improvement)
2. Perform relevant analysis using specialized tools
3. Add detailed comments with findings and recommendations
4. Update issue priority based on comprehensive analysis
5. Suggest next steps or additional requirements

### Example Workflow

1. **Bug Report Analysis**:
   - Bug Agent searches for similar issues on Stack Overflow and GitHub
   - Analyzes error patterns and potential solutions
   - Provides code quality recommendations if applicable
   - Sets priority based on impact and urgency
   - Adds detailed comments with findings and next steps

2. **Feature Request Analysis**:
   - Feature Agent researches similar products on ProductHunt
   - Analyzes competitor implementations
   - Assesses technical feasibility and challenges
   - Sets priority based on business value and implementation effort
   - Provides detailed market and technical recommendations

3. **Improvement Analysis**:
   - Improvement Agent analyzes performance metrics and thresholds
   - Evaluates code quality patterns and technical debt
   - Checks dependencies for updates and security issues
   - Sets priority based on technical impact and implementation risk
   - Provides optimization recommendations with context-aware priorities

Each analysis includes:

- Detailed findings from specialized tools
- Context-aware recommendations
- Automatic priority updates with explanations
- Integration with external knowledge bases
- Clear next steps and requirements

## 🔒 Security

- Secure storage of API keys using Cloudflare Workers' environment variables
- Linear webhook signature validation
- IP allowlist validation
- Rate limiting implementation
- Sanitized error outputs

## 🚨 Error Handling

The system implements robust error handling:

- Webhook request validation
- Tool execution error handling
- Detailed error reporting
- Graceful failure recovery

## 🤝 Contributing

We welcome contributions! Please read our [Contributing Guide](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development process
- Pull request guidelines
- Testing requirements
- Style guide

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Linear](https://linear.app) for their excellent issue tracking system and API
- [Upstash](https://upstash.com) for their serverless workflow engine
- [Cloudflare](https://cloudflare.com) for their edge computing platform
- [OpenAI](https://openai.com) for their language models

## 📫 Support

- Open an issue for bug reports or feature requests
- Follow me on [X](https://x.com/kevin-kidd) for updates
- Star the repo if you find it useful!

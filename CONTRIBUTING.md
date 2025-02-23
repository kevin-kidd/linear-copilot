# Contributing to Linear Copilot

First off, thank you for considering contributing to Linear Copilot! It's people like you that make Linear Copilot such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [harrison.kevin@pm.me].

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* Use a clear and descriptive title
* Describe the exact steps which reproduce the problem
* Provide specific examples to demonstrate the steps
* Describe the behavior you observed after following the steps
* Explain which behavior you expected to see instead and why
* Include screenshots if possible
* Include error messages and stack traces if any
* Specify your environment (OS, Node.js version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* Use a clear and descriptive title
* Provide a step-by-step description of the suggested enhancement
* Provide specific examples to demonstrate the steps
* Describe the current behavior and explain which behavior you expected to see instead
* Explain why this enhancement would be useful
* List any similar features in other projects
* Specify which version of the project you're using
* Specify the name and version of the OS you're using

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Include screenshots and animated GIFs in your pull request whenever possible
* Follow the TypeScript styleguide
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline
* Avoid platform-dependent code
* Ensure all tests pass
* Update documentation as needed

## Development Process

1. Fork the repo
2. Create a new branch from `main`
3. Make your changes
4. Run the tests
5. Push to your fork and submit a pull request

### Branch Naming Convention

* Feature branches: `feature/description`
* Bug fix branches: `fix/description`
* Documentation branches: `docs/description`
* Performance improvement branches: `perf/description`

### Setup Development Environment

```bash
# Clone your fork
git clone git@github.com:kevin-kidd/linear-copilot.git

# Add upstream remote
git remote add upstream https://github.com/kevin-kidd/linear-copilot.git

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Configure your environment variables
# Edit .env with your values

# Run tests
npm test

# Run linter
npm run lint

# Run type checks
npm run type-check
```

### Commit Messages

* Use the present tense ("Add feature" not "Added feature")
* Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
* Limit the first line to 72 characters or less
* Reference issues and pull requests liberally after the first line
* Consider starting the commit message with an applicable emoji:
  * 🎨 `:art:` when improving the format/structure of the code
  * 🐛 `:bug:` when fixing a bug
  * 📝 `:memo:` when writing docs
  * ✨ `:sparkles:` when adding a new feature
  * ⚡️ `:zap:` when improving performance
  * 🔒 `:lock:` when dealing with security

## Style Guide

### TypeScript

* Use TypeScript for all new code
* Follow the existing code style
* Use meaningful variable names
* Add types for all variables and function parameters
* Use interfaces for complex types
* Document public APIs
* Use ESLint and Prettier configurations provided in the project
* Avoid using `any` type unless absolutely necessary
* Prefer `interface` over `type` for object definitions
* Use proper error handling with typed errors

### Testing

* Write tests for all new features
* Maintain existing tests
* Run the entire test suite before submitting a pull request
* Follow the existing test patterns
* Include both unit and integration tests where appropriate
* Mock external services appropriately
* Test error conditions and edge cases
* Aim for high test coverage on new code

### Documentation

* Use JSDoc comments for functions and classes
* Keep README.md up to date
* Document all new features
* Update API documentation
* Include examples where helpful
* Document breaking changes

## Additional Notes

### Issue and Pull Request Labels

* `bug` - Something isn't working
* `enhancement` - New feature or request
* `documentation` - Improvements or additions to documentation
* `good first issue` - Good for newcomers
* `help wanted` - Extra attention is needed
* `security` - Security-related issues
* `performance` - Performance-related issues
* `refactor` - Code refactoring
* `tests` - Testing-related changes

## Questions?

Feel free to open an issue with your question or contact the maintainers directly at [harrison.kevin@pm.me].

## Project Maintainers

* [Kevin Kidd](https://github.com/kevin-kidd) - Lead Developer

Thank you for contributing to Linear Copilot! 🚀

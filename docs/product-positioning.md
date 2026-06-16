# Product Positioning

Repo Test Architect should be positioned as an audit-first test strategy tool, not another generic AI test writer.

## Core Claim

The tool audits a repository, detects existing test conventions, ranks high-value native test opportunities, explains skipped areas, and reports remaining risk before any generation happens.

## Differentiation

Most AI testing tools start at generation:

- write unit tests
- write UI tests
- increase coverage
- repair failing generated tests

Repo Test Architect starts one layer earlier:

- what kind of repo is this
- what should be tested directly
- what should be tested indirectly
- what should not get direct tests
- what conventions already exist
- what command verifies the work
- what risk remains

The defensible value is the audit graph and strategy layer. Native generation is one future action, not the product thesis.

## Initial Audience

The first useful audience is technical:

- senior engineers improving test quality
- tech leads reviewing risky code areas
- platform or developer productivity teams
- consultants assessing unfamiliar repositories
- teams adopting AI coding tools but wanting guardrails against meaningless tests

This audience values evidence, reproducibility, local-first security, and clear non-goals.

## Business Paths

Possible outcomes:

- open-source credibility and portfolio proof
- paid CLI or hosted reporting later
- consulting around test strategy, repo audits, MCP, and evaluation harnesses
- integration into developer productivity platforms
- acquisition interest from testing, CI, code quality, QA automation, or AI coding tool vendors

Acquisition should be treated as optional upside. The product should first become useful and credible on its own.

## Proof Points To Build

- deterministic fixtures across multiple repository shapes
- adapter contract that survives a second language
- model-consistency scenarios for stable recommendations
- local-first MCP install path
- demo path that shows useful planning without generated tests
- reports that make skipped areas and remaining risk explicit

## Anti-Positioning

Avoid claims that the tool:

- maximizes coverage
- generates tests for everything
- replaces test strategy
- supports every language equally
- runs remote repo analysis by default
- provides native generation before adapter-specific repair-loop evidence exists

The pitch should stay narrow: fewer, better, repo-native tests based on an audit users can inspect.

---
name: workflow-automation-planner
description: Turn repetitive manual workflows into practical automation plans. Use when the user wants to reduce manual work, map a process, identify automation opportunities, choose tools, design handoffs, or create a step-by-step implementation plan for no-code, low-code, script, API, or AI-agent automation.
---

# Workflow Automation Planner

## Goal

Convert a repeated manual workflow into a clear automation plan that a human, developer, or operations team can execute.

## Workflow

1. Capture the current manual process.
2. Identify triggers, inputs, outputs, decisions, tools, owners, and failure points.
3. Separate the process into:
   - Keep manual
   - Automate now
   - Automate later
   - Remove entirely
4. Recommend a practical automation approach.
5. Produce an implementation plan with phases, risks, and validation checks.

## Discovery Questions

Ask only for missing information that changes the automation design:

- What starts the workflow?
- What tools or systems are involved?
- What data is copied, transformed, reviewed, or approved?
- What is the expected output?
- How often does this happen?
- What errors or delays happen most often?
- Are there compliance, privacy, or approval constraints?

If enough detail exists, proceed without asking.

## Output Format

Prefer this structure:

```markdown
# Automation Plan: [Workflow Name]

## Current Manual Workflow
- Trigger:
- Inputs:
- Steps:
- Outputs:
- Owners:

## Friction Points
- Time sinks:
- Error risks:
- Bottlenecks:

## Automation Opportunities
| Step | Recommendation | Why |
| --- | --- | --- |

## Recommended Solution
- Approach:
- Tools:
- Data flow:
- Human review points:

## Implementation Plan
1. Phase 1
2. Phase 2
3. Phase 3

## Validation Checklist
- [ ] Test happy path
- [ ] Test missing/invalid data
- [ ] Confirm output quality
- [ ] Confirm owner approval
```

## Recommendation Rules

- Prefer simple automation over complex architecture.
- Keep humans in the loop for judgment, approvals, legal, financial, hiring, medical, or reputation-sensitive decisions.
- Do not recommend storing secrets in prompts, spreadsheets, or plain text.
- Call out when an integration needs API access, webhooks, permissions, or paid tooling.
- Include a manual fallback when the workflow is business-critical.

## Common Automation Patterns

- Form submission to task creation.
- Email parsing to CRM/update workflow.
- Spreadsheet cleanup to dashboard/report.
- Support request to triage and draft reply.
- Document intake to summary and checklist.
- Content brief to draft, review, and publish.
- Invoice/order data extraction to accounting entry.

## Final Checks

Before responding, confirm:

- The plan reduces real manual work.
- Each automation recommendation has a clear trigger and output.
- Human review points are explicit.
- Risks and validation steps are included.

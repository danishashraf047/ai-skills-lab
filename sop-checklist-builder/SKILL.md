---
name: sop-checklist-builder
description: Convert repeated manual processes into clear SOPs, checklists, handoff docs, and reusable operating instructions. Use when the user wants to document a workflow, reduce mistakes, delegate work, train someone, standardize delivery, or prepare a process for future automation.
---

# SOP Checklist Builder

## Goal

Turn messy process notes, chat instructions, recordings, or rough steps into a clear standard operating procedure and checklist.

## Workflow

1. Identify the process goal and owner.
2. Extract the trigger, inputs, tools, steps, decisions, outputs, and completion criteria.
3. Rewrite the process as an SOP that a new person could follow.
4. Add a checklist for execution.
5. Add quality checks, edge cases, and escalation rules.
6. Mark automation opportunities separately.

## Ask Only If Needed

Ask concise questions only when missing information would make the SOP unsafe or unusable:

- Who performs this process?
- What starts the process?
- What tools/accounts are needed?
- What counts as done?
- What mistakes should be avoided?
- Who approves exceptions?

## Output Format

Prefer this structure:

```markdown
# SOP: [Process Name]

## Purpose

## When To Use This SOP

## Owner

## Tools And Access Needed

## Inputs

## Step-by-Step Procedure
1. Step
2. Step
3. Step

## Execution Checklist
- [ ] Check
- [ ] Check
- [ ] Check

## Quality Checks
- [ ] Output is complete
- [ ] Required fields are accurate
- [ ] Approvals are captured

## Edge Cases
| Situation | What To Do |
| --- | --- |

## Escalation Rules

## Automation Opportunities
```

## Writing Rules

- Use direct, plain language.
- Make steps observable and actionable.
- Avoid vague instructions like "handle it" or "check everything."
- Include exact field names, file names, tools, and owners when provided.
- Separate procedure steps from quality checks.
- Use checklists for repeated execution.
- Use tables for edge cases and decision rules.

## Automation Notes

When useful, add an `Automation Opportunities` section:

- Repetitive copy/paste work.
- Data validation.
- Notifications and reminders.
- Report generation.
- Draft generation.
- File naming and folder creation.
- Status updates between tools.

Do not redesign the whole process unless the user asks. Keep the SOP usable immediately.

## Final Checks

Before responding, confirm:

- The SOP has a clear trigger and done state.
- A new person could follow it.
- Checklist items are concrete.
- Edge cases and escalation paths are included when relevant.

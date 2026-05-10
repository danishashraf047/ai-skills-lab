# AI Skills Lab

Portable AI skills for reducing manual work, documenting workflows, and building reusable assistant behavior.

## Skills

- `workflow-automation-planner`: Turns repetitive manual workflows into practical automation plans.
- `sop-checklist-builder`: Converts repeatable work into SOPs, checklists, handoff docs, and quality checks.

## How To Use

Point your assistant at a skill's `SKILL.md` file. These skills are plain Markdown, so they can be used by Codex, Claude Code, or any assistant that can read files from your repo.

### Use With Codex

From a Codex session opened at this repo, ask:

```text
Use ai-skills-lab/workflow-automation-planner/SKILL.md.
Help me reduce manual work in this workflow:
[paste workflow]
```

Or use the SOP skill:

```text
Use ai-skills-lab/sop-checklist-builder/SKILL.md.
Turn this process into an SOP and checklist:
[paste process notes]
```

If you want Codex to auto-discover a skill, copy that skill folder into your Codex skills directory:

```bash
cp -R workflow-automation-planner ~/.codex/skills/
cp -R sop-checklist-builder ~/.codex/skills/
```

Then start a new Codex session and ask:

```text
Use the Workflow Automation Planner skill to reduce manual work in this process:
[paste workflow]
```

### Use With Claude Code

Claude Code can use these skills by reading the Markdown instructions directly. From a Claude Code session opened at this repo, ask:

```text
Read workflow-automation-planner/SKILL.md and use it as your instructions.
Help me reduce manual work in this workflow:
[paste workflow]
```

Or:

```text
Read sop-checklist-builder/SKILL.md and use it as your instructions.
Turn this process into an SOP and execution checklist:
[paste process notes]
```

If Claude Code is opened from a parent folder, include the repo folder in the path:

```text
Read ai-skills-lab/workflow-automation-planner/SKILL.md and use it as your instructions.
```

## Repo Structure

```text
ai-skills-lab/
  workflow-automation-planner/
    SKILL.md
    agents/
      openai.yaml
  sop-checklist-builder/
    SKILL.md
    agents/
      openai.yaml
```

## Create More Skills

Use one folder per skill. Skill names should be lowercase, hyphen-separated, and descriptive.

### Manual Folder Setup

```bash
mkdir -p my-new-skill/agents
touch my-new-skill/SKILL.md
touch my-new-skill/agents/openai.yaml
```

Minimum `SKILL.md`:

```markdown
---
name: my-new-skill
description: What this skill does and when an assistant should use it.
---

# My New Skill

## Goal

Explain what this skill helps the assistant do.

## Workflow

1. First step.
2. Second step.
3. Final check.
```

Minimum `agents/openai.yaml`:

```yaml
interface:
  display_name: "My New Skill"
  short_description: "Short skill summary."
  default_prompt: "Use this skill to help me with..."
```

### Create A Skill With Codex

From the repo root, ask Codex:

```text
Create a new portable AI skill in ai-skills-lab named email-triage-assistant.
It should help reduce manual work by sorting emails, identifying action items, drafting replies, and creating a follow-up checklist.
Include SKILL.md and agents/openai.yaml.
Keep it tool-agnostic and validate the skill if a validator is available.
```

If you already have Codex's skill creator available, you can ask:

```text
Use the skill-creator skill to create ai-skills-lab/email-triage-assistant.
Make it a portable skill with SKILL.md and agents/openai.yaml.
```

### Create A Skill With Claude Code

From the repo root, ask Claude Code:

```text
Create a new portable AI skill folder at ai-skills-lab/email-triage-assistant.
Add SKILL.md with YAML frontmatter containing name and description.
Add agents/openai.yaml with display_name, short_description, and default_prompt.
The skill should help reduce manual email triage work.
Keep the instructions concise, practical, and tool-agnostic.
```

### Optional Git Commands

After creating or editing skills:

```bash
git status
git add README.md my-new-skill/
git commit -m "Add my new skill"
git push origin main
```

## Notes

- Keep skills tool-agnostic where possible.
- Put private client or company details in a private repo instead.
- Keep `SKILL.md` concise and action-oriented.

## Author

Danish Ashraf · danish.ashraf@codehills.net · https://codehills.net
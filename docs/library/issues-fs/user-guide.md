# Issues-FS CLI User Guide

**Version:** v1.0
**Date:** 2026-02-06

## Getting Started

### Installation

Install Issues-FS CLI using pip:

```bash
pip install issues-fs-cli
```

Or with Poetry:

```bash
poetry add issues-fs-cli
```

### Initializing a Repository

Before using Issues-FS, initialize a repository in your project:

```bash
cd my-project
issues-fs init
```

This creates a `.issues/` directory with:
- Default node types (bug, task, feature, person, git-repo)
- Default link types (blocks, has-task, assigned-to, depends-on, relates-to, contains)
- Index files for tracking issues

## Working with Issues

### Creating Issues

Create a bug:

```bash
issues-fs create bug "Login button not responding"
```

Create a task with options:

```bash
issues-fs create task "Implement rate limiting" \
    --description "Add rate limiting to all API endpoints" \
    --status todo \
    --priority P1 \
    --tags "api,security"
```

Create a feature:

```bash
issues-fs create feature "Dark mode support" \
    --description "Allow users to switch to dark theme"
```

### Viewing Issues

List all issues:

```bash
issues-fs list
```

Filter by type:

```bash
issues-fs list --type bug
```

Filter by status:

```bash
issues-fs list --status backlog
```

Show issue details:

```bash
issues-fs show Bug-1
```

Show with graph traversal (connected issues):

```bash
issues-fs show Bug-1 --depth 2
```

### Updating Issues

Update status:

```bash
issues-fs update Bug-1 --status confirmed
```

Update multiple fields:

```bash
issues-fs update Task-1 \
    --status in-progress \
    --priority P0 \
    --tags "urgent,api"
```

### Deleting Issues

Delete with confirmation:

```bash
issues-fs delete Bug-99
```

Delete without confirmation:

```bash
issues-fs delete Bug-99 --force
```

## Working with Links

### Creating Links

Link a bug that blocks a task:

```bash
issues-fs link Bug-1 blocks Task-1
```

Link a task to a feature:

```bash
issues-fs link Task-1 task-of Feature-1
```

Mark a dependency:

```bash
issues-fs link Task-2 depends-on Task-1
```

### Available Link Types

| Verb | Inverse | Description |
|------|---------|-------------|
| `blocks` | `blocked-by` | Issue prevents progress on another |
| `has-task` | `task-of` | Parent contains child task |
| `assigned-to` | `assignee-of` | Work assigned to person |
| `depends-on` | `dependency-of` | Issue requires another to complete |
| `relates-to` | `relates-to` | General association |
| `contains` | `contained-by` | Parent contains child |

### Viewing Links

List links for an issue:

```bash
issues-fs links Bug-1
```

### Removing Links

Remove a link:

```bash
issues-fs unlink Bug-1 Task-1
```

## Working with Comments

### Adding Comments

Add a comment:

```bash
issues-fs comment Bug-1 "Investigating the root cause"
```

Add a comment with author:

```bash
issues-fs comment Bug-1 "Fix deployed to staging" --author "ci-bot"
```

### Viewing Comments

List all comments:

```bash
issues-fs comments Bug-1
```

## Output Formats

### Table Format (Default)

Human-readable tables for terminal use:

```bash
issues-fs list
```

Output:
```
Label           Type         Status          Title
──────────────────────────────────────────────────
Bug-1           bug          confirmed       Login button not working
Task-1          task         in-progress     Fix the login page

Total: 2
```

### JSON Format

Machine-readable JSON for scripts:

```bash
issues-fs list --output json
```

### Markdown Format

Documentation-friendly format:

```bash
issues-fs show Bug-1 --output markdown
```

### Agent Mode

Full JSON output optimized for AI agents:

```bash
issues-fs show Bug-1 --for-agent
```

This includes:
- All node fields
- Complete link information
- Timestamps and audit data

## Type Management

### Listing Node Types

View available node types:

```bash
issues-fs types list
```

### Listing Link Types

View available link types:

```bash
issues-fs link-types list
```

### Initializing Default Types

Reset types to defaults:

```bash
issues-fs types init
```

## Workflows

### Bug Tracking Workflow

```bash
# 1. Create a bug
issues-fs create bug "API returns 500 error"

# 2. Confirm the bug
issues-fs update Bug-1 --status confirmed

# 3. Create a task to fix it
issues-fs create task "Fix API error handling"

# 4. Link the task to the bug
issues-fs link Task-1 task-of Bug-1

# 5. Start work
issues-fs update Task-1 --status in-progress

# 6. Add progress notes
issues-fs comment Task-1 "Found the issue - null pointer in handler"

# 7. Complete the task
issues-fs update Task-1 --status done

# 8. Resolve the bug
issues-fs update Bug-1 --status resolved
```

### Feature Development Workflow

```bash
# 1. Create a feature
issues-fs create feature "User authentication"

# 2. Break down into tasks
issues-fs create task "Implement login endpoint"
issues-fs create task "Implement logout endpoint"
issues-fs create task "Add session management"

# 3. Link tasks to feature
issues-fs link Task-1 task-of Feature-1
issues-fs link Task-2 task-of Feature-1
issues-fs link Task-3 task-of Feature-1

# 4. Set dependencies
issues-fs link Task-2 depends-on Task-1
issues-fs link Task-3 depends-on Task-1

# 5. View the feature graph
issues-fs show Feature-1 --depth 2
```

## Tips and Tricks

### Tab Completion

Install shell completion:

```bash
issues-fs --install-completion
```

### Working with Git

Issues-FS stores data in files, so you can:

```bash
# Commit your issues
git add .issues/
git commit -m "Add bug tracking for login issue"

# See issue changes
git diff .issues/
```

### Scripting

Use JSON output for scripting:

```bash
# Get all open bugs as JSON
issues-fs list --type bug --status backlog --output json | jq '.nodes[].label'

# Check if a specific issue exists
if issues-fs show Bug-1 --output json 2>/dev/null; then
    echo "Bug-1 exists"
fi
```

### Agent Integration

For AI agent workflows:

```bash
# Agent reads task
TASK=$(issues-fs show Task-1 --for-agent)

# Extract status
STATUS=$(echo $TASK | jq -r '.status')

# Update when done
issues-fs update Task-1 --status done
issues-fs comment Task-1 "Completed by AI agent"
```

## Troubleshooting

### "No .issues/ directory found"

You need to initialize a repository first:

```bash
issues-fs init
```

Or navigate to a directory containing `.issues/`.

### "Invalid label format"

Labels must follow the pattern `Type-Number`:
- ✅ `Bug-1`, `Task-123`, `Feature-5`
- ❌ `bug1`, `TASK_1`, `feature`

### "Node not found"

The specified issue doesn't exist. Check with:

```bash
issues-fs list --type bug
```

### "Invalid node type"

Use one of the configured types. View available types:

```bash
issues-fs types list
```

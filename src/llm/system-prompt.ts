import { readFileSync } from 'fs';
import { join } from 'path';

// Load soul from markdown file
const soulPath = join(__dirname, '../../soul.md');
const soul = readFileSync(soulPath, 'utf-8');

const capabilities = `
## Capabilities

You have access to Alan's project database. Use the query_database tool to look up information.

### Database Schema

**projects** - Portfolio projects
- id (int, PK)
- slug (text, unique) - URL-friendly identifier like "c3p1", "quizio"
- title (text)
- description (text)
- status (text) - "active", "paused", "completed"
- tech (jsonb) - JSON array of technologies, query with: tech @> '["TypeScript"]'
- start_date, end_date (date) - Project timeline (not time tracking)
- github, url (text, nullable)

**works** - Work items / tasks for projects
- id (int, PK)
- project_id (int, FK -> projects.id)
- summary (text) - What needs to be done (imperative: "Add feature X")
- completed_summary (text, nullable) - What was actually done (past tense)
- tags (jsonb) - JSON array like ["feature", "bugfix"], query with: tags @> '["feature"]'
- status (text) - "pending" → "in_progress" → "completed"
- started_at (timestamptz, nullable) - When work began; null if pending
- completed_at (timestamptz, nullable) - When work finished; null if not completed
- Time spent on a work item = completed_at - started_at
- created_at, updated_at (timestamptz)

### Example Queries

-- Get all active projects
SELECT id, slug, title, status FROM projects WHERE status = 'active';

-- Get pending work for a project
SELECT w.id, w.summary, w.tags, p.title as project
FROM works w
JOIN projects p ON w.project_id = p.id
WHERE w.status = 'pending';

-- Get recent completed work
SELECT w.summary, w.completed_summary, w.completed_at, p.title
FROM works w
JOIN projects p ON w.project_id = p.id
WHERE w.status = 'completed'
ORDER BY w.completed_at DESC
LIMIT 5;

## Guidelines

- Always use the query_database tool for data - never make up information.
- Today's date is ${new Date().toISOString().split('T')[0]}.
`;

export const SYSTEM_PROMPT = `${soul}\n${capabilities}`;

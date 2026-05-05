import type Anthropic from '@anthropic-ai/sdk';

export const tools: Anthropic.Tool[] = [
  {
    name: 'list_automation_jobs',
    description: 'List automation jobs, optionally filtered by project and status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_slug: {
          type: 'string',
          description: 'Optional project slug to filter jobs',
        },
        status: {
          type: 'string',
          enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
          description: 'Optional automation job status filter',
        },
        limit: {
          type: 'number',
          description: 'Optional limit',
        },
      },
    },
  },
  {
    name: 'list_projects',
    description: 'List active projects available for work tracking.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'list_work_items',
    description: 'List work items by status, optionally filtered to a single project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_slug: {
          type: 'string',
          description: 'Optional project slug to filter to one project',
        },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed'],
          description: 'Work item status to list',
        },
        limit: {
          type: 'number',
          description: 'Optional limit for completed items; ignored for pending/in_progress unless needed',
        },
      },
      required: ['status'],
    },
  },
  {
    name: 'create_quiz_batch_job',
    description: 'Create a tracked quiz batch automation job linked to a work item.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_slug: {
          type: 'string',
          description: 'Project slug, usually "quizio"',
        },
        family: {
          type: 'string',
          description: 'Quiz family/lane, e.g. "largest-cities" or "country-subdivisions"',
        },
        requested_count: {
          type: 'number',
          description: 'How many quizzes to create in this batch',
        },
        summary: {
          type: 'string',
          description: 'Optional work item summary; if omitted, a default summary is generated',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for the linked work item',
        },
        request_payload: {
          type: 'object' as const,
          description: 'Optional structured job payload with lane-specific parameters',
        },
      },
      required: ['project_slug', 'family', 'requested_count'],
    },
  },
  {
    name: 'query_database',
    description: `Execute a read-only SQL query against the database. Use this to look up information about projects, work items, etc. Only SELECT queries are allowed.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description: 'The SELECT query to execute',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'add_work_item',
    description: 'Add a new pending work item to a project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_slug: {
          type: 'string',
          description: 'Project slug (e.g., "c3p1", "quizio")',
        },
        summary: {
          type: 'string',
          description: 'Brief description in imperative form (e.g., "Add user authentication")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the work item (e.g., ["feature", "ui"])',
        },
      },
      required: ['project_slug', 'summary', 'tags'],
    },
  },
  {
    name: 'complete_work_item',
    description: 'Mark a work item as completed.',
    input_schema: {
      type: 'object' as const,
      properties: {
        work_id: {
          type: 'number',
          description: 'The ID of the work item to complete',
        },
        completed_summary: {
          type: 'string',
          description: 'Optional summary of what was accomplished (past tense)',
        },
      },
      required: ['work_id'],
    },
  },
  {
    name: 'start_work_item',
    description: 'Mark an existing pending work item as in progress.',
    input_schema: {
      type: 'object' as const,
      properties: {
        work_id: {
          type: 'number',
          description: 'The ID of the work item to start',
        },
      },
      required: ['work_id'],
    },
  },
  {
    name: 'create_and_start_work_item',
    description: 'Create a new ad-hoc work item and immediately mark it in progress.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_slug: {
          type: 'string',
          description: 'Project slug (e.g., "c3p1", "quizio")',
        },
        summary: {
          type: 'string',
          description: 'Brief description in imperative form (e.g., "Add provider config")',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for the work item',
        },
      },
      required: ['project_slug', 'summary', 'tags'],
    },
  },
  {
    name: 'update_work_item',
    description: 'Update an existing work item (summary, tags).',
    input_schema: {
      type: 'object' as const,
      properties: {
        work_id: {
          type: 'number',
          description: 'The ID of the work item to update',
        },
        summary: {
          type: 'string',
          description: 'New summary (imperative form)',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'New tags array',
        },
      },
      required: ['work_id'],
    },
  },
  {
    name: 'delete_work_item',
    description: 'Delete a pending work item permanently. Only works on items with status "pending".',
    input_schema: {
      type: 'object' as const,
      properties: {
        work_id: {
          type: 'number',
          description: 'The ID of the work item to delete',
        },
      },
      required: ['work_id'],
    },
  },
];

import type Anthropic from '@anthropic-ai/sdk';

// Memory tool - built-in type for persistent storage
export const memoryTool = {
  type: 'memory_20250818' as const,
  name: 'memory' as const,
};

export const customTools: Anthropic.Tool[] = [
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

// Combined tools array including memory
export const tools = [...customTools, memoryTool] as Anthropic.Messages.Tool[];

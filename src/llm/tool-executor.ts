import { supabase } from '../db/client';
import {
  addWorkItem,
  completeWorkItem,
  updateWorkItem,
  deleteWorkItem,
  getProjectBySlug,
} from '../db/queries';

interface ToolInput {
  sql?: string;
  project_slug?: string;
  summary?: string;
  tags?: string[];
  work_id?: number;
  completed_summary?: string;
}

function logTool(name: string, input: ToolInput, result: string): void {
  console.log(`[TOOL] ${name}`);
  if (input.sql) {
    console.log(`  SQL: ${input.sql}`);
  } else {
    console.log(`  Input: ${JSON.stringify(input)}`);
  }
  // Truncate long results for readability
  const truncated = result.length > 500 ? result.slice(0, 500) + '...' : result;
  console.log(`  Result: ${truncated}`);
}

export async function executeTool(
  name: string,
  input: ToolInput
): Promise<string> {
  let result: string;

  try {
    switch (name) {
      case 'query_database': {
        if (!input.sql) {
          result = JSON.stringify({ error: 'sql is required' });
          break;
        }

        // Clean up the query
        const cleanedSql = input.sql.trim().replace(/;+$/, '');

        // Only allow SELECT queries
        if (!cleanedSql.toLowerCase().startsWith('select')) {
          result = JSON.stringify({ error: 'Only SELECT queries are allowed' });
          break;
        }

        const { data, error } = await supabase.rpc('exec_sql', { query: cleanedSql });

        if (error) {
          // Fallback: try direct query if RPC doesn't exist
          // This uses Supabase's PostgREST which is safer
          result = JSON.stringify({ error: `Query failed: ${error.message}` });
          break;
        }

        result = JSON.stringify({ rows: data });
        break;
      }

      case 'add_work_item': {
        if (!input.project_slug || !input.summary || !input.tags) {
          result = JSON.stringify({ error: 'project_slug, summary, and tags are required' });
          break;
        }
        const project = await getProjectBySlug(input.project_slug);
        if (!project) {
          result = JSON.stringify({ error: `Project "${input.project_slug}" not found` });
          break;
        }
        const item = await addWorkItem(project.id, input.summary, input.tags);
        result = JSON.stringify({ success: true, item });
        break;
      }

      case 'complete_work_item': {
        if (!input.work_id) {
          result = JSON.stringify({ error: 'work_id is required' });
          break;
        }
        const item = await completeWorkItem(input.work_id, input.completed_summary);
        result = JSON.stringify({ success: true, item });
        break;
      }

      case 'update_work_item': {
        if (!input.work_id) {
          result = JSON.stringify({ error: 'work_id is required' });
          break;
        }
        if (!input.summary && !input.tags) {
          result = JSON.stringify({ error: 'At least one of summary or tags is required' });
          break;
        }
        const updates: { summary?: string; tags?: string[] } = {};
        if (input.summary) updates.summary = input.summary;
        if (input.tags) updates.tags = input.tags;
        const updatedItem = await updateWorkItem(input.work_id, updates);
        result = JSON.stringify({ success: true, item: updatedItem });
        break;
      }

      case 'delete_work_item': {
        if (!input.work_id) {
          result = JSON.stringify({ error: 'work_id is required' });
          break;
        }
        await deleteWorkItem(input.work_id);
        result = JSON.stringify({ success: true, message: `Work item ${input.work_id} deleted` });
        break;
      }

      default:
        result = JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    result = JSON.stringify({ error: message });
  }

  logTool(name, input, result);
  return result;
}

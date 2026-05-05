import { supabase } from '../db/client';
import {
  addWorkItem,
  createAutomationJob,
  completeWorkItem,
  getProjectBySlug,
  getActiveProjects,
  getPendingWork,
  getInProgressWork,
  getRecentCompletedWork,
  getWorkItemById,
  listAutomationJobs,
  startWorkItem,
  updateWorkItem,
  deleteWorkItem,
  logActionReceipt,
} from '../db/queries';
import type { AutomationJobStatus } from '../db/types';
import type { TriggerType } from '../db/types';

export interface ToolContext {
  triggerType: TriggerType;
  triggerRef: string;
  agentId?: string;
}

interface ToolInput {
  sql?: string;
  project_slug?: string;
  status?: 'pending' | 'in_progress' | 'completed';
  automation_status?: AutomationJobStatus;
  limit?: number;
  summary?: string;
  tags?: string[];
  work_id?: number;
  completed_summary?: string;
  family?: string;
  requested_count?: number;
  request_payload?: Record<string, unknown>;
}

const USER_DRIVEN_AGENT = 'manual';

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
  input: ToolInput,
  context?: ToolContext
): Promise<string> {
  let result: string;
  let actionType: string | null = null;
  let actionSummary: string | null = null;
  let actionMetadata: Record<string, unknown> | null = null;

  try {
    switch (name) {
      case 'list_automation_jobs': {
        let projectId: number | undefined;
        if (input.project_slug) {
          const project = await getProjectBySlug(input.project_slug);
          if (!project) {
            result = JSON.stringify({ error: `Project "${input.project_slug}" not found` });
            break;
          }
          projectId = project.id;
        }

        const jobs = await listAutomationJobs({
          projectId,
          status: input.status as AutomationJobStatus | undefined,
          limit: input.limit,
        });

        result = JSON.stringify({ jobs });
        actionType = 'automation_jobs_listed';
        actionSummary = `Listed ${jobs.length} automation job(s)`;
        actionMetadata = {
          project_slug: input.project_slug ?? null,
          status: input.status ?? null,
          count: jobs.length,
        };
        break;
      }

      case 'list_projects': {
        const projects = await getActiveProjects();
        result = JSON.stringify({ projects });
        actionType = 'project_listed';
        actionSummary = `Listed ${projects.length} active projects`;
        actionMetadata = { count: projects.length };
        break;
      }

      case 'list_work_items': {
        if (!input.status) {
          result = JSON.stringify({ error: 'status is required' });
          break;
        }

        let projectId: number | undefined;
        if (input.project_slug) {
          const project = await getProjectBySlug(input.project_slug);
          if (!project) {
            result = JSON.stringify({ error: `Project "${input.project_slug}" not found` });
            break;
          }
          projectId = project.id;
        }

        let items;
        if (input.status === 'pending') {
          items = await getPendingWork(projectId);
        } else if (input.status === 'in_progress') {
          items = await getInProgressWork(projectId);
        } else {
          items = await getRecentCompletedWork(projectId, input.limit || 10);
        }

        result = JSON.stringify({ items });
        actionType = 'work_items_listed';
        actionSummary = `Listed ${items.length} ${input.status} work item(s)`;
        actionMetadata = { project_slug: input.project_slug ?? null, status: input.status, count: items.length };
        break;
      }

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
        actionType = 'db_query';
        actionSummary = `Queried database: ${cleanedSql.slice(0, 80)}${cleanedSql.length > 80 ? '...' : ''}`;
        actionMetadata = { sql: cleanedSql, row_count: data?.length ?? 0 };
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

        // Fetch recent completed_summaries for style reference BEFORE creating
        const { data: recentWork } = await supabase
          .from('works')
          .select('completed_summary')
          .eq('project_id', project.id)
          .eq('status', 'completed')
          .not('completed_summary', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(5);
        const styleExamples = recentWork?.map(w => w.completed_summary) || [];

        const item = await addWorkItem(project.id, input.summary, input.tags, USER_DRIVEN_AGENT, null);

        result = JSON.stringify({
          success: true,
          item,
          style_reference: styleExamples,
          note: 'Check if the summary matches style_reference voice/structure. If not, use update_work_item to fix it.'
        });
        actionType = 'work_item_created';
        actionSummary = `Created work item: ${input.summary}`;
        actionMetadata = { work_id: item.id, project_slug: input.project_slug, tags: input.tags };
        break;
      }

      case 'complete_work_item': {
        if (!input.work_id) {
          result = JSON.stringify({ error: 'work_id is required' });
          break;
        }
        const existing = await getWorkItemById(input.work_id);
        if (!existing) {
          result = JSON.stringify({ error: `Work item ${input.work_id} not found` });
          break;
        }
        const completedItem = await completeWorkItem(input.work_id, input.completed_summary, USER_DRIVEN_AGENT);
        result = JSON.stringify({ success: true, item: completedItem });
        actionType = 'work_item_completed';
        actionSummary = `Completed work item #${input.work_id}`;
        actionMetadata = { work_id: input.work_id, completed_summary: input.completed_summary };
        break;
      }

      case 'start_work_item': {
        if (!input.work_id) {
          result = JSON.stringify({ error: 'work_id is required' });
          break;
        }
        const existing = await getWorkItemById(input.work_id);
        if (!existing) {
          result = JSON.stringify({ error: `Work item ${input.work_id} not found` });
          break;
        }
        const startedItem = await startWorkItem(input.work_id);
        result = JSON.stringify({ success: true, item: startedItem });
        actionType = 'work_item_started';
        actionSummary = `Started work item #${input.work_id}`;
        actionMetadata = { work_id: input.work_id };
        break;
      }

      case 'create_and_start_work_item': {
        if (!input.project_slug || !input.summary || !input.tags) {
          result = JSON.stringify({ error: 'project_slug, summary, and tags are required' });
          break;
        }
        const project = await getProjectBySlug(input.project_slug);
        if (!project) {
          result = JSON.stringify({ error: `Project "${input.project_slug}" not found` });
          break;
        }
        const item = await addWorkItem(project.id, input.summary, input.tags, USER_DRIVEN_AGENT, null);
        const startedItem = await startWorkItem(item.id);
        result = JSON.stringify({ success: true, item: startedItem });
        actionType = 'work_item_created_and_started';
        actionSummary = `Created and started work item: ${input.summary}`;
        actionMetadata = { work_id: startedItem.id, project_slug: input.project_slug, tags: input.tags };
        break;
      }

      case 'create_quiz_batch_job': {
        if (!input.project_slug || !input.family || !input.requested_count) {
          result = JSON.stringify({ error: 'project_slug, family, and requested_count are required' });
          break;
        }

        const project = await getProjectBySlug(input.project_slug);
        if (!project) {
          result = JSON.stringify({ error: `Project "${input.project_slug}" not found` });
          break;
        }

        const tags = input.tags ?? ['automation', 'quiz-batch', input.family];
        const summary = input.summary || `Create ${input.requested_count} ${input.family} quizzes`;
        const workItem = await addWorkItem(project.id, summary, tags, USER_DRIVEN_AGENT, null);
        const startedWorkItem = await startWorkItem(workItem.id);

        const requestPayload = {
          family: input.family,
          requested_count: input.requested_count,
          ...(input.request_payload ?? {}),
        };

        const job = await createAutomationJob({
          jobType: 'quiz_batch_create',
          projectId: project.id,
          workId: startedWorkItem.id,
          requestPayload,
          agentId: 'c3p1',
        });

        result = JSON.stringify({
          success: true,
          work_item: startedWorkItem,
          automation_job: job,
        });
        actionType = 'quiz_batch_job_created';
        actionSummary = `Created quiz batch job for ${input.requested_count} ${input.family} quizzes`;
        actionMetadata = {
          work_id: startedWorkItem.id,
          automation_job_id: job.id,
          project_slug: input.project_slug,
          family: input.family,
          requested_count: input.requested_count,
        };
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
        actionType = 'work_item_updated';
        actionSummary = `Updated work item #${input.work_id}`;
        actionMetadata = { work_id: input.work_id, updates };
        break;
      }

      case 'delete_work_item': {
        if (!input.work_id) {
          result = JSON.stringify({ error: 'work_id is required' });
          break;
        }
        await deleteWorkItem(input.work_id);
        result = JSON.stringify({ success: true, message: `Work item ${input.work_id} deleted` });
        actionType = 'work_item_deleted';
        actionSummary = `Deleted work item #${input.work_id}`;
        actionMetadata = { work_id: input.work_id };
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

  // Log action receipt if we have context and a successful action
  if (context && actionType && actionSummary) {
    try {
      await logActionReceipt(
        context.triggerType,
        context.triggerRef,
        actionType,
        actionSummary,
        actionMetadata ?? undefined,
        context.agentId
      );
    } catch (err) {
      // Don't fail the tool call if logging fails
      console.error('[ACTION_RECEIPT] Failed to log:', err);
    }
  }

  return result;
}

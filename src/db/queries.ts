import { supabase } from './client';
import type { Project, WorkItem, WorkItemWithProject, Message, ActionReceipt, ApiUsage, TriggerType, TaskRun, TaskStatus } from './types';

// Work item queries

export async function getPendingWork(projectId?: number): Promise<WorkItemWithProject[]> {
  let query = supabase
    .from('works')
    .select('*, project:projects(id, slug, title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch pending work: ${error.message}`);
  return data as WorkItemWithProject[];
}

export async function getInProgressWork(projectId?: number): Promise<WorkItemWithProject[]> {
  let query = supabase
    .from('works')
    .select('*, project:projects(id, slug, title)')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false });

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch in-progress work: ${error.message}`);
  return data as WorkItemWithProject[];
}

export async function getRecentCompletedWork(
  projectId?: number,
  limit = 10
): Promise<WorkItemWithProject[]> {
  let query = supabase
    .from('works')
    .select('*, project:projects(id, slug, title)')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch completed work: ${error.message}`);
  return data as WorkItemWithProject[];
}

export async function addWorkItem(
  projectId: number,
  summary: string,
  tags: string[] = []
): Promise<WorkItem> {
  const { data, error } = await supabase
    .from('works')
    .insert({
      project_id: projectId,
      summary,
      tags,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add work item: ${error.message}`);
  return data as WorkItem;
}

export async function startWorkItem(workId: number): Promise<WorkItem> {
  const { data, error } = await supabase
    .from('works')
    .update({
      status: 'in_progress',
      started_at: new Date().toISOString(),
    })
    .eq('id', workId)
    .select()
    .single();

  if (error) throw new Error(`Failed to start work item: ${error.message}`);
  return data as WorkItem;
}

export async function completeWorkItem(
  workId: number,
  completedSummary?: string
): Promise<WorkItem> {
  const { data, error } = await supabase
    .from('works')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      ...(completedSummary && { completed_summary: completedSummary }),
    })
    .eq('id', workId)
    .select()
    .single();

  if (error) throw new Error(`Failed to complete work item: ${error.message}`);
  return data as WorkItem;
}

// Project queries

export async function getActiveProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('status', 'active')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch projects: ${error.message}`);
  return data as Project[];
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch project: ${error.message}`);
  }
  return data as Project;
}

export async function getProjectById(id: number): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch project: ${error.message}`);
  }
  return data as Project;
}

export async function updateWorkItem(
  workId: number,
  updates: { summary?: string; tags?: string[] }
): Promise<WorkItem> {
  const { data, error } = await supabase
    .from('works')
    .update(updates)
    .eq('id', workId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update work item: ${error.message}`);
  return data as WorkItem;
}

export async function deleteWorkItem(workId: number): Promise<void> {
  // Only allow deleting pending work items
  const { data: item, error: fetchError } = await supabase
    .from('works')
    .select('status')
    .eq('id', workId)
    .single();

  if (fetchError) throw new Error(`Work item not found: ${fetchError.message}`);
  if (item.status !== 'pending') {
    throw new Error(`Can only delete pending work items (current status: ${item.status})`);
  }

  const { error } = await supabase.from('works').delete().eq('id', workId);

  if (error) throw new Error(`Failed to delete work item: ${error.message}`);
}

// Message queries

export async function addMessage(
  conversationKey: string,
  role: 'user' | 'assistant',
  content: string,
  agentId?: string,
  metadata?: Record<string, unknown>
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_key: conversationKey,
      role,
      content,
      agent_id: agentId ?? null,
      metadata: metadata ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to add message: ${error.message}`);
  return data as Message;
}

export async function getMessages(
  conversationKey: string,
  limit = 20
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_key', conversationKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  // Reverse to get chronological order
  return (data as Message[]).reverse();
}

export async function hasMessages(conversationKey: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_key', conversationKey);

  if (error) throw new Error(`Failed to check messages: ${error.message}`);
  return (count ?? 0) > 0;
}

// Action receipt queries

export async function getActionReceipts(
  triggerRef: string,
  limit = 10
): Promise<ActionReceipt[]> {
  const { data, error } = await supabase
    .from('action_receipts')
    .select('*')
    .eq('trigger_ref', triggerRef)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch action receipts: ${error.message}`);
  return data as ActionReceipt[];
}

// Action receipt logging

export async function logActionReceipt(
  triggerType: TriggerType,
  triggerRef: string,
  actionType: string,
  actionSummary: string,
  metadata?: Record<string, unknown>,
  agentId = 'c3p1'
): Promise<ActionReceipt> {
  const { data, error } = await supabase
    .from('action_receipts')
    .insert({
      agent_id: agentId,
      trigger_type: triggerType,
      trigger_ref: triggerRef,
      action_type: actionType,
      action_summary: actionSummary,
      metadata: metadata ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to log action receipt: ${error.message}`);
  return data as ActionReceipt;
}

// API usage logging

export async function logApiUsage(
  triggerType: TriggerType,
  triggerRef: string,
  tokensIn: number,
  tokensOut: number,
  agentId = 'c3p1'
): Promise<ApiUsage> {
  const { data, error } = await supabase
    .from('api_usage')
    .insert({
      agent_id: agentId,
      trigger_type: triggerType,
      trigger_ref: triggerRef,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to log API usage: ${error.message}`);
  return data as ApiUsage;
}

// Task run tracking

export async function startTaskRun(
  taskName: string,
  metadata?: Record<string, unknown>,
  agentId = 'c3p1'
): Promise<TaskRun> {
  const { data, error } = await supabase
    .from('task_runs')
    .insert({
      task_name: taskName,
      agent_id: agentId,
      status: 'running',
      metadata: metadata ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to start task run: ${error.message}`);
  return data as TaskRun;
}

export async function completeTaskRun(
  taskRunId: number,
  resultSummary: string,
  metadata?: Record<string, unknown>
): Promise<TaskRun> {
  const updateData: Record<string, unknown> = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    result_summary: resultSummary,
  };
  if (metadata) updateData.metadata = metadata;

  const { data, error } = await supabase
    .from('task_runs')
    .update(updateData)
    .eq('id', taskRunId)
    .select()
    .single();

  if (error) throw new Error(`Failed to complete task run: ${error.message}`);
  return data as TaskRun;
}

export async function failTaskRun(
  taskRunId: number,
  errorMessage: string
): Promise<TaskRun> {
  const { data, error } = await supabase
    .from('task_runs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      result_summary: errorMessage,
    })
    .eq('id', taskRunId)
    .select()
    .single();

  if (error) throw new Error(`Failed to fail task run: ${error.message}`);
  return data as TaskRun;
}

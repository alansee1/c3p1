import { supabase } from './client';
import type { Project, WorkItem, WorkItemWithProject } from './types';

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

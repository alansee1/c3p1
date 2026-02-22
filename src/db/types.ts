export interface Project {
  id: number;
  slug: string;
  title: string;
  description: string;
  long_description: string | null;
  status: 'active' | 'paused' | 'completed';
  tech: string[];
  github: string | null;
  url: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkItem {
  id: number;
  project_id: number;
  summary: string;
  completed_summary: string | null;
  tags: string[];
  status: 'pending' | 'in_progress' | 'completed';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkItemWithProject extends WorkItem {
  project: Pick<Project, 'id' | 'slug' | 'title'>;
}

export interface Message {
  id: number;
  conversation_key: string;
  role: 'user' | 'assistant';
  agent_id: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type TriggerType = 'conversation' | 'background' | 'scheduled';

export interface ActionReceipt {
  id: number;
  agent_id: string;
  trigger_type: TriggerType;
  trigger_ref: string;
  action_type: string;
  action_summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ApiUsage {
  id: number;
  agent_id: string;
  trigger_type: TriggerType;
  trigger_ref: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
}

export type TaskStatus = 'running' | 'completed' | 'failed';

export interface TaskRun {
  id: number;
  task_name: string;
  agent_id: string;
  status: TaskStatus;
  started_at: string;
  completed_at: string | null;
  result_summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

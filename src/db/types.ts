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

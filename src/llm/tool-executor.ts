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
  // Memory tool inputs
  command?: 'view' | 'create' | 'str_replace' | 'insert' | 'delete' | 'rename';
  path?: string;
  file_text?: string;
  old_str?: string;
  new_str?: string;
  insert_line?: number;
  insert_text?: string;
  old_path?: string;
  new_path?: string;
  view_range?: [number, number];
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

// Memory tool implementation using Supabase as storage backend
async function executeMemoryCommand(input: ToolInput): Promise<string> {
  const { command, path } = input;

  // Security: ensure all paths are under /memories
  const validatePath = (p: string | undefined): string | null => {
    if (!p) return null;
    if (!p.startsWith('/memories')) return null;
    if (p.includes('..')) return null; // Prevent traversal
    return p;
  };

  switch (command) {
    case 'view': {
      const safePath = validatePath(path);
      if (!safePath) {
        return `The path ${path} does not exist. Please provide a valid path.`;
      }

      if (safePath === '/memories') {
        // List directory contents
        const { data, error } = await supabase
          .from('memories')
          .select('path')
          .like('path', '/memories/%');

        if (error) return `Error reading directory: ${error.message}`;

        const files = data?.map(m => m.path) || [];
        if (files.length === 0) {
          return `Here're the files and directories up to 2 levels deep in /memories, excluding hidden items:\n4.0K\t/memories\n(empty directory)`;
        }

        const listing = files.map(f => `1.0K\t${f}`).join('\n');
        return `Here're the files and directories up to 2 levels deep in /memories, excluding hidden items:\n4.0K\t/memories\n${listing}`;
      }

      // Read specific file
      const { data, error } = await supabase
        .from('memories')
        .select('content')
        .eq('path', safePath)
        .single();

      if (error || !data) {
        return `The path ${safePath} does not exist. Please provide a valid path.`;
      }

      const lines = data.content.split('\n');
      const [start, end] = input.view_range || [1, lines.length];
      const selectedLines = lines.slice(start - 1, end);
      const numbered = selectedLines
        .map((line: string, i: number) => `${String(start + i).padStart(6)}\t${line}`)
        .join('\n');

      return `Here's the content of ${safePath} with line numbers:\n${numbered}`;
    }

    case 'create': {
      const safePath = validatePath(path);
      if (!safePath) {
        return `Error: Invalid path ${path}`;
      }

      // Check if file already exists
      const { data: existing } = await supabase
        .from('memories')
        .select('id')
        .eq('path', safePath)
        .single();

      if (existing) {
        return `Error: File ${safePath} already exists`;
      }

      const { error } = await supabase
        .from('memories')
        .insert({ path: safePath, content: input.file_text || '' });

      if (error) return `Error creating file: ${error.message}`;
      return `File created successfully at: ${safePath}`;
    }

    case 'str_replace': {
      const safePath = validatePath(path);
      if (!safePath) {
        return `Error: The path ${path} does not exist. Please provide a valid path.`;
      }

      const { data, error } = await supabase
        .from('memories')
        .select('content')
        .eq('path', safePath)
        .single();

      if (error || !data) {
        return `Error: The path ${safePath} does not exist. Please provide a valid path.`;
      }

      const oldStr = input.old_str || '';
      const newStr = input.new_str || '';

      // Check for multiple occurrences
      const occurrences = data.content.split(oldStr).length - 1;
      if (occurrences === 0) {
        return `No replacement was performed, old_str \`${oldStr}\` did not appear verbatim in ${safePath}.`;
      }
      if (occurrences > 1) {
        const lines = data.content.split('\n');
        const lineNums = lines
          .map((line: string, i: number) => (line.includes(oldStr) ? i + 1 : null))
          .filter(Boolean);
        return `No replacement was performed. Multiple occurrences of old_str \`${oldStr}\` in lines: ${lineNums.join(', ')}. Please ensure it is unique`;
      }

      const newContent = data.content.replace(oldStr, newStr);
      await supabase
        .from('memories')
        .update({ content: newContent, updated_at: new Date().toISOString() })
        .eq('path', safePath);

      return `The memory file has been edited.`;
    }

    case 'insert': {
      const safePath = validatePath(path);
      if (!safePath) {
        return `Error: The path ${path} does not exist`;
      }

      const { data, error } = await supabase
        .from('memories')
        .select('content')
        .eq('path', safePath)
        .single();

      if (error || !data) {
        return `Error: The path ${safePath} does not exist`;
      }

      const lines = data.content.split('\n');
      const insertLine = input.insert_line ?? 0;

      if (insertLine < 0 || insertLine > lines.length) {
        return `Error: Invalid \`insert_line\` parameter: ${insertLine}. It should be within the range of lines of the file: [0, ${lines.length}]`;
      }

      lines.splice(insertLine, 0, input.insert_text || '');
      const newContent = lines.join('\n');

      await supabase
        .from('memories')
        .update({ content: newContent, updated_at: new Date().toISOString() })
        .eq('path', safePath);

      return `The file ${safePath} has been edited.`;
    }

    case 'delete': {
      const safePath = validatePath(path);
      if (!safePath) {
        return `Error: The path ${path} does not exist`;
      }

      // Delete the file or all files under a directory path
      const { error } = await supabase
        .from('memories')
        .delete()
        .like('path', safePath.endsWith('/') ? `${safePath}%` : safePath);

      if (error) return `Error: ${error.message}`;
      return `Successfully deleted ${safePath}`;
    }

    case 'rename': {
      const safeOldPath = validatePath(input.old_path);
      const safeNewPath = validatePath(input.new_path);

      if (!safeOldPath) {
        return `Error: The path ${input.old_path} does not exist`;
      }
      if (!safeNewPath) {
        return `Error: Invalid destination path ${input.new_path}`;
      }

      // Check destination doesn't exist
      const { data: existing } = await supabase
        .from('memories')
        .select('id')
        .eq('path', safeNewPath)
        .single();

      if (existing) {
        return `Error: The destination ${safeNewPath} already exists`;
      }

      const { error } = await supabase
        .from('memories')
        .update({ path: safeNewPath, updated_at: new Date().toISOString() })
        .eq('path', safeOldPath);

      if (error) return `Error: ${error.message}`;
      return `Successfully renamed ${safeOldPath} to ${safeNewPath}`;
    }

    default:
      return `Unknown memory command: ${command}`;
  }
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

        // Fetch recent summaries for style reference
        const { data: recentWork } = await supabase
          .from('works')
          .select('summary')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(5);
        const styleExamples = recentWork?.map(w => w.summary) || [];

        result = JSON.stringify({
          success: true,
          item,
          style_reference: styleExamples,
          note: 'For future items, match the voice of style_reference examples'
        });
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

      case 'memory': {
        result = await executeMemoryCommand(input);
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

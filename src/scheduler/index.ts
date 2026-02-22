import cron from 'node-cron';
import {
  startTaskRun,
  completeTaskRun,
  failTaskRun,
  logActionReceipt,
  logApiUsage,
} from '../db/queries';

// Context passed to every task handler for consistent logging
export interface TaskContext {
  taskRunId: number;
  taskName: string;
  // Log an action taken by the task
  logAction: (
    actionType: string,
    summary: string,
    metadata?: Record<string, unknown>
  ) => Promise<void>;
  // Log API token usage
  logUsage: (tokensIn: number, tokensOut: number) => Promise<void>;
}

export function createTaskContext(taskRunId: number, taskName: string): TaskContext {
  return {
    taskRunId,
    taskName,
    logAction: async (actionType, summary, metadata) => {
      await logActionReceipt(
        'scheduled',
        taskRunId.toString(),
        actionType,
        summary,
        metadata
      );
    },
    logUsage: async (tokensIn, tokensOut) => {
      await logApiUsage('scheduled', taskRunId.toString(), tokensIn, tokensOut);
    },
  };
}

export interface ScheduledTask {
  name: string;
  schedule: string; // cron expression
  handler: (ctx: TaskContext) => Promise<string>; // returns result summary
}

const registeredTasks: ScheduledTask[] = [];

export function registerTask(task: ScheduledTask): void {
  registeredTasks.push(task);
  console.log(`[SCHEDULER] Registered task: ${task.name} (${task.schedule})`);
}

async function runTask(task: ScheduledTask): Promise<void> {
  console.log(`[SCHEDULER] Starting task: ${task.name}`);
  const taskRun = await startTaskRun(task.name);
  const ctx = createTaskContext(taskRun.id, task.name);

  try {
    const resultSummary = await task.handler(ctx);
    await completeTaskRun(taskRun.id, resultSummary);
    console.log(`[SCHEDULER] Completed task: ${task.name} - ${resultSummary}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await failTaskRun(taskRun.id, errorMessage);
    console.error(`[SCHEDULER] Failed task: ${task.name} - ${errorMessage}`);
  }
}

export function startScheduler(): void {
  for (const task of registeredTasks) {
    cron.schedule(task.schedule, () => {
      runTask(task).catch(console.error);
    });
    console.log(`[SCHEDULER] Scheduled: ${task.name}`);
  }
  console.log(`[SCHEDULER] Started with ${registeredTasks.length} task(s)`);
}

// Manual trigger for testing
export async function runTaskNow(taskName: string): Promise<void> {
  const task = registeredTasks.find(t => t.name === taskName);
  if (!task) {
    throw new Error(`Task not found: ${taskName}`);
  }
  await runTask(task);
}

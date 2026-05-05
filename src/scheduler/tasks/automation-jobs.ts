import { runQueuedAutomationJobs } from '../../automation/runner';
import type { TaskContext } from '../index';

export async function runAutomationJobsTask(ctx: TaskContext): Promise<string> {
  return runQueuedAutomationJobs(ctx, 5);
}

import {
  completeAutomationJob,
  completeWorkItem,
  failAutomationJob,
  getAutomationJobById,
  listAutomationJobs,
  startAutomationJob,
} from '../db/queries';
import type { AutomationJob } from '../db/types';
import type { TaskContext } from '../scheduler';

type QuizBatchCreatePayload = {
  family?: string;
  requested_count?: number;
  [key: string]: unknown;
};

type JobExecutionResult = {
  summary: string;
  resultPayload?: Record<string, unknown>;
  completeLinkedWork?: boolean;
  completedWorkSummary?: string;
};

async function handleQuizBatchCreate(
  job: AutomationJob,
  ctx: TaskContext
): Promise<JobExecutionResult> {
  const payload = job.request_payload as QuizBatchCreatePayload;
  const family = typeof payload.family === 'string' ? payload.family : null;
  const requestedCount = typeof payload.requested_count === 'number' ? payload.requested_count : null;

  if (!family || !requestedCount) {
    throw new Error('quiz_batch_create job missing family or requested_count');
  }

  await ctx.logAction('quiz_batch_job_started', `Processing quiz batch job #${job.id}`, {
    automation_job_id: job.id,
    family,
    requested_count: requestedCount,
  });

  // First pass: the runner plumbing is real, but family-specific generation
  // handlers still need to be implemented. Fail loudly rather than pretending.
  throw new Error(`quiz_batch_create for family "${family}" is not implemented yet`);
}

async function executeAutomationJob(
  job: AutomationJob,
  ctx: TaskContext
): Promise<JobExecutionResult> {
  switch (job.job_type) {
    case 'quiz_batch_create':
      return handleQuizBatchCreate(job, ctx);
    default:
      throw new Error(`Unsupported automation job type: ${job.job_type}`);
  }
}

export async function runAutomationJobById(
  jobId: number,
  ctx: TaskContext
): Promise<JobExecutionResult> {
  const existing = await getAutomationJobById(jobId);
  if (!existing) {
    throw new Error(`Automation job ${jobId} not found`);
  }

  if (existing.status !== 'queued') {
    throw new Error(`Automation job ${jobId} is ${existing.status}, not queued`);
  }

  const runningJob = await startAutomationJob(jobId);

  try {
    const result = await executeAutomationJob(runningJob, ctx);
    await completeAutomationJob(jobId, result.resultPayload);

    if (result.completeLinkedWork && runningJob.work_id) {
      await completeWorkItem(
        runningJob.work_id,
        result.completedWorkSummary || result.summary,
        'c3p1'
      );
    }

    await ctx.logAction('automation_job_completed', `Automation job #${jobId} completed`, {
      automation_job_id: jobId,
      job_type: runningJob.job_type,
      result_payload: result.resultPayload ?? null,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown automation job error';
    await failAutomationJob(jobId, message);
    await ctx.logAction('automation_job_failed', `Automation job #${jobId} failed`, {
      automation_job_id: jobId,
      job_type: runningJob.job_type,
      error: message,
    });
    throw error;
  }
}

export async function runQueuedAutomationJobs(
  ctx: TaskContext,
  limit = 5
): Promise<string> {
  const queuedJobs = await listAutomationJobs({ status: 'queued', limit });

  if (queuedJobs.length === 0) {
    return 'No queued automation jobs';
  }

  const summaries: string[] = [];

  for (const queued of queuedJobs) {
    try {
      const result = await runAutomationJobById(queued.id, ctx);
      summaries.push(`#${queued.id} completed: ${result.summary}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown automation job error';
      summaries.push(`#${queued.id} failed: ${message}`);
    }
  }

  return `Processed ${queuedJobs.length} automation job(s): ${summaries.join(' | ')}`;
}

import '../src/config';
import { runAutomationJobsTask } from '../src/scheduler/tasks/automation-jobs';
import { startTaskRun, completeTaskRun, failTaskRun } from '../src/db/queries';
import { createTaskContext } from '../src/scheduler';

async function main() {
  console.log('Running automation jobs...');
  const taskRun = await startTaskRun('automation-jobs', { manual: true });
  const ctx = createTaskContext(taskRun.id, 'automation-jobs');

  try {
    const result = await runAutomationJobsTask(ctx);
    await completeTaskRun(taskRun.id, result);
    console.log('✅ Done:', result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await failTaskRun(taskRun.id, msg);
    console.error('❌ Failed:', msg);
    process.exit(1);
  }

  process.exit(0);
}

main();

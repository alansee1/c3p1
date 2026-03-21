import '../src/config';
import { runDailyTweet } from '../src/scheduler/tasks/daily-tweet';
import { startTaskRun, completeTaskRun, failTaskRun } from '../src/db/queries';
import { createTaskContext } from '../src/scheduler';

async function main() {
  console.log('Running daily tweet task...');
  const taskRun = await startTaskRun('daily-tweet', { manual: true });
  const ctx = createTaskContext(taskRun.id, 'daily-tweet');

  try {
    const result = await runDailyTweet(ctx);
    await completeTaskRun(taskRun.id, result);
    console.log('Done:', result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await failTaskRun(taskRun.id, msg);
    console.error('Failed:', msg);
  }

  process.exit(0);
}

main();

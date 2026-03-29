import '../src/config';
import { app } from '../src/slack/app';
import '../src/slack/handlers'; // Register button handlers
import { runTwitterMentions } from '../src/scheduler/tasks/twitter-mentions';
import { startTaskRun, completeTaskRun, failTaskRun } from '../src/db/queries';
import { createTaskContext } from '../src/scheduler';

async function main() {
  // Start Slack app to handle button clicks
  await app.start();
  console.log('Slack app started (for button handling)');

  console.log('Running twitter mentions task...');
  const taskRun = await startTaskRun('twitter-mentions', { manual: true });
  const ctx = createTaskContext(taskRun.id, 'twitter-mentions');

  try {
    const result = await runTwitterMentions(ctx);
    await completeTaskRun(taskRun.id, result);
    console.log('Done:', result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await failTaskRun(taskRun.id, msg);
    console.error('Failed:', msg);
  }

  console.log('Waiting for button interactions... (Ctrl+C to exit)');
  // Keep running to handle button clicks
}

main().catch((error) => {
  console.error('Failed:', error);
  process.exit(1);
});

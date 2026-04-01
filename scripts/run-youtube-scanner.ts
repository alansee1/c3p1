import '../src/config';
import { app } from '../src/slack/app';
import { runYouTubeScanner } from '../src/scheduler/tasks/youtube-scanner';
import { startTaskRun, completeTaskRun, failTaskRun } from '../src/db/queries';
import { createTaskContext } from '../src/scheduler';

async function main() {
  console.log('Starting Slack app (needed for posting)...');
  await app.start();

  console.log('Running YouTube scanner...');
  const taskRun = await startTaskRun('youtube-scanner', { manual: true });
  const ctx = createTaskContext(taskRun.id, 'youtube-scanner');

  try {
    const result = await runYouTubeScanner(ctx);
    await completeTaskRun(taskRun.id, result);
    console.log('✅ Done:', result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    await failTaskRun(taskRun.id, msg);
    console.error('❌ Failed:', msg);
  }

  process.exit(0);
}

main();

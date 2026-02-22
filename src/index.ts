import { app } from './slack/app';
import './slack/handlers';
import { registerAllTasks } from './scheduler/tasks';
import { startScheduler } from './scheduler';

async function main() {
  // Register scheduled tasks
  registerAllTasks();

  // Start the scheduler
  startScheduler();

  // Start Slack bot
  await app.start();
  console.log('C3P1 is online. Ready to assist, sir.');
}

main().catch((error) => {
  console.error('Failed to start C3P1:', error);
  process.exit(1);
});

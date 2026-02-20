import { app } from './slack/app';
import './slack/handlers';

async function main() {
  await app.start();
  console.log('Cortana is online. Very good, sir.');
}

main().catch((error) => {
  console.error('Failed to start Cortana:', error);
  process.exit(1);
});

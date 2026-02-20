import { app } from './slack/app';
import './slack/handlers';

async function main() {
  await app.start();
  console.log('C3P1 is online. Ready to assist, sir.');
}

main().catch((error) => {
  console.error('Failed to start C3P1:', error);
  process.exit(1);
});

import { registerTask } from '../index';
import { runQuizScanner } from './quiz-scanner';
import { runDailyTweet } from './daily-tweet';

export function registerAllTasks(): void {
  // Quiz scanner - runs daily at 9am
  registerTask({
    name: 'quiz-scanner',
    schedule: '0 9 * * *', // 9:00 AM every day
    handler: runQuizScanner,
  });

  // Daily tweet - runs at midnight PST (8 AM UTC)
  registerTask({
    name: 'daily-tweet',
    schedule: '0 8 * * *', // Midnight PST = 8 AM UTC
    handler: runDailyTweet,
  });
}

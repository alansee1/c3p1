import { registerTask } from '../index';
import { runQuizScanner } from './quiz-scanner';

export function registerAllTasks(): void {
  // Quiz scanner - runs daily at 9am
  registerTask({
    name: 'quiz-scanner',
    schedule: '0 9 * * *', // 9:00 AM every day
    handler: runQuizScanner,
  });
}

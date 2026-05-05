import { registerTask } from '../index';
import { runQuizScanner } from './quiz-scanner';
import { runDailyTweet } from './daily-tweet';
import { runQuizIdeasScanner } from './quiz-ideas';
import { runTwitterMentions } from './twitter-mentions';
import { runYouTubeScanner } from './youtube-scanner';
import { runAutomationJobsTask } from './automation-jobs';

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

  // Quiz ideas - runs weekly on Sundays at 10 AM UTC
  registerTask({
    name: 'quiz-ideas',
    schedule: '0 10 * * 0', // Sundays at 10 AM UTC
    handler: runQuizIdeasScanner,
  });

  // Twitter mentions - runs daily at 10 AM UTC (2 AM PST)
  registerTask({
    name: 'twitter-mentions',
    schedule: '0 10 * * *', // 10 AM UTC daily
    handler: runTwitterMentions,
  });

  // YouTube trivia scanner - runs Mondays and Thursdays at 11 AM UTC
  registerTask({
    name: 'youtube-scanner',
    schedule: '0 11 * * 1,4', // Mondays and Thursdays at 11 AM UTC
    handler: runYouTubeScanner,
  });

  // Automation jobs - runs every 5 minutes
  registerTask({
    name: 'automation-jobs',
    schedule: '*/5 * * * *',
    handler: runAutomationJobsTask,
  });
}

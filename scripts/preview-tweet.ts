import * as fs from 'fs';
import * as path from 'path';
import '../src/config';
import { getRecentActionReceipts, getRecentApiUsage, getCompletedWorkSince } from '../src/db/queries';
import { generateInfographic, type ReportData } from '../src/twitter/infographic';
import type { ActionReceipt, WorkItemWithProject } from '../src/db/types';

function formatDate(): string {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
}

function countActionTypes(receipts: ActionReceipt[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of receipts) {
    counts[r.action_type] = (counts[r.action_type] || 0) + 1;
  }
  return counts;
}

function calculateHoursWorked(workItems: WorkItemWithProject[]): number {
  let totalMs = 0;
  for (const item of workItems) {
    if (item.started_at && item.completed_at) {
      const start = new Date(item.started_at).getTime();
      const end = new Date(item.completed_at).getTime();
      if (end > start) {
        totalMs += end - start;
      }
    }
  }
  return totalMs / (1000 * 60 * 60);
}

async function main() {
  console.log('Fetching data...');
  const receipts = await getRecentActionReceipts(24);
  const workItems = await getCompletedWorkSince(24);
  const usage = await getRecentApiUsage(24);

  const actionCounts = countActionTypes(receipts);
  const itemCount = workItems.length;
  const hoursWorked = calculateHoursWorked(workItems);

  // Group work items by project
  const projectCounts: Record<string, number> = {};
  for (const item of workItems) {
    const slug = item.project?.slug || 'other';
    projectCounts[slug] = (projectCounts[slug] || 0) + 1;
  }
  const projects = Object.entries(projectCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  console.log('\nReport data:');
  console.log(`- Action counts:`, actionCounts);
  console.log(`- Projects:`, projects);
  console.log(`- Items shipped: ${itemCount}`);
  console.log(`- Hours worked: ${hoursWorked.toFixed(2)}`);
  console.log(`- API cost: $${usage.cost.toFixed(4)}`);

  console.log('\nGenerating infographic...');
  const reportData: ReportData = {
    date: formatDate(),
    actionCounts,
    projects,
    itemCount,
    hoursWorked,
    apiCost: usage.cost,
  };

  const imageBuffer = await generateInfographic(reportData);

  const outputPath = path.join(__dirname, 'preview-infographic.png');
  fs.writeFileSync(outputPath, imageBuffer);

  console.log(`\n✅ Infographic saved to: ${outputPath}`);
  console.log(`   Size: ${(imageBuffer.length / 1024).toFixed(1)} KB`);
}

main().catch(console.error);

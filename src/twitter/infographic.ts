import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import * as fs from 'fs';
import * as path from 'path';

let fontRegular: ArrayBuffer | null = null;
let fontBold: ArrayBuffer | null = null;
let fontSemiBold: ArrayBuffer | null = null;

async function loadFonts(): Promise<{
  regular: ArrayBuffer;
  semiBold: ArrayBuffer;
  bold: ArrayBuffer;
}> {
  if (fontRegular && fontBold && fontSemiBold) {
    return { regular: fontRegular, semiBold: fontSemiBold, bold: fontBold };
  }

  const [regular, semiBold, bold] = await Promise.all([
    fetch(
      'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff'
    ).then((r) => r.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hjp-Ek-_EeA.woff'
    ).then((r) => r.arrayBuffer()),
    fetch(
      'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hjp-Ek-_EeA.woff'
    ).then((r) => r.arrayBuffer()),
  ]);

  fontRegular = regular;
  fontSemiBold = semiBold;
  fontBold = bold;
  return { regular, semiBold, bold };
}

function loadAvatarBase64(): string {
  const avatarPath = path.join(__dirname, '../../assets/c3p1headshot-small.jpg');
  const imageBuffer = fs.readFileSync(avatarPath);
  return `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
}

export interface ReportData {
  date: string;
  actionCounts: Record<string, number>;
  projects: { name: string; count: number }[];
  itemCount: number;
  hoursWorked: number;
  apiCost: number;
}

interface TaskSummary {
  name: string;
  description: string;
}

// Infer tasks from action types and build summaries
function inferTasks(actionCounts: Record<string, number>): TaskSummary[] {
  const tasks: TaskSummary[] = [];

  // Quizio Scanner task
  const searches = actionCounts['reddit_search'] || 0;
  const analyzed = actionCounts['post_analyzed'] || 0;
  const flagged = actionCounts['slack_notification'] || 0;

  if (searches > 0 || analyzed > 0) {
    if (flagged > 0) {
      tasks.push({
        name: 'Quizio Scanner',
        description: `${analyzed} posts, ${flagged} flagged`,
      });
    } else {
      tasks.push({
        name: 'Quizio Scanner',
        description: `${analyzed} posts scanned`,
      });
    }
  }

  // Daily Report task
  const posted = actionCounts['tweet_posted'] || 0;
  if (posted > 0) {
    tasks.push({
      name: 'Daily Report',
      description: 'Posted to X',
    });
  }

  // Work item creation (from Slack)
  const workItems = actionCounts['work_item_created'] || 0;
  if (workItems > 0) {
    tasks.push({
      name: 'Slack Assistant',
      description: `${workItems} item${workItems > 1 ? 's' : ''} created`,
    });
  }

  return tasks;
}

function generateStatusLine(actionCounts: Record<string, number>): string {
  const flagged = actionCounts['slack_notification'] || 0;
  const analyzed = actionCounts['post_analyzed'] || 0;
  const workItems = actionCounts['work_item_created'] || 0;

  if (flagged > 0 && analyzed > 0) {
    return `Scanned Reddit for Quizio leads, flagged ${flagged}`;
  }
  if (workItems > 0) {
    return `Created ${workItems} work item${workItems > 1 ? 's' : ''} from Slack`;
  }
  if (analyzed > 0) {
    return `Scanned ${analyzed} Reddit posts, nothing notable`;
  }
  return `Quiet day, systems nominal`;
}

function formatHours(hours: number): string {
  if (hours === 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours % 1 === 0) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}

export async function generateInfographic(data: ReportData): Promise<Buffer> {
  const fonts = await loadFonts();
  const avatarBase64 = loadAvatarBase64();
  const statusLine = generateStatusLine(data.actionCounts);
  const tasks = inferTasks(data.actionCounts);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          background: '#0c0c12',
          padding: '28px 32px',
          fontFamily: 'Inter',
        },
        children: [
          // Header row
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '20px',
              },
              children: [
                {
                  type: 'img',
                  props: {
                    src: avatarBase64,
                    width: 46,
                    height: 46,
                    style: {
                      borderRadius: '10px',
                      border: '2px solid rgba(212, 165, 116, 0.6)',
                    },
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      gap: '2px',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          },
                          children: [
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '18px',
                                  fontWeight: 700,
                                  color: '#D4A574',
                                },
                                children: 'C-3P1',
                              },
                            },
                            {
                              type: 'div',
                              props: {
                                style: {
                                  fontSize: '12px',
                                  color: 'rgba(255, 255, 255, 0.3)',
                                },
                                children: `• ${data.date}`,
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '12px',
                            color: 'rgba(255, 255, 255, 0.45)',
                          },
                          children: `"${statusLine}"`,
                        },
                      },
                    ],
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: {
                      padding: '5px 10px',
                      background: 'rgba(0, 212, 255, 0.12)',
                      borderRadius: '14px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#00D4FF',
                    },
                    children: `$${data.apiCost.toFixed(2)}`,
                  },
                },
              ],
            },
          },
          // Two columns
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                gap: '12px',
                flex: 1,
              },
              children: [
                // Autonomous - task based
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      background: 'rgba(0, 212, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      borderLeft: '3px solid #00D4FF',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '9px',
                            fontWeight: 600,
                            color: 'rgba(255, 255, 255, 0.4)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '10px',
                          },
                          children: 'Autonomous',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          },
                          children:
                            tasks.length > 0
                              ? tasks.slice(0, 3).map((task) => buildTaskItem(task, '#00D4FF'))
                              : [
                                  {
                                    type: 'div',
                                    props: {
                                      style: {
                                        fontSize: '11px',
                                        color: 'rgba(255, 255, 255, 0.4)',
                                        fontStyle: 'italic',
                                      },
                                      children: 'No tasks ran',
                                    },
                                  },
                                ],
                        },
                      },
                    ],
                  },
                },
                // Human - stats based
                {
                  type: 'div',
                  props: {
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      flex: 1,
                      background: 'rgba(212, 165, 116, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      borderLeft: '3px solid #D4A574',
                    },
                    children: [
                      {
                        type: 'div',
                        props: {
                          style: {
                            fontSize: '9px',
                            fontWeight: 600,
                            color: 'rgba(255, 255, 255, 0.4)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '10px',
                          },
                          children: 'Human',
                        },
                      },
                      {
                        type: 'div',
                        props: {
                          style: {
                            display: 'flex',
                            justifyContent: 'space-around',
                          },
                          children: [
                            buildStat(data.projects.length.toString(), 'projects', '#D4A574'),
                            buildStat(data.itemCount.toString(), 'shipped', '#D4A574'),
                            buildStat(formatHours(data.hoursWorked), 'worked', '#D4A574'),
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // Projects worked on
          data.projects.length > 0
            ? {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '12px',
                    flexWrap: 'wrap',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontSize: '9px',
                          color: 'rgba(255, 255, 255, 0.3)',
                          marginRight: '4px',
                        },
                        children: 'Worked on:',
                      },
                    },
                    ...data.projects.slice(0, 4).map((proj, i) => ({
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        },
                        children: [
                          i > 0
                            ? {
                                type: 'div',
                                props: {
                                  style: {
                                    fontSize: '9px',
                                    color: 'rgba(255, 255, 255, 0.2)',
                                  },
                                  children: '•',
                                },
                              }
                            : null,
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '10px',
                                color: '#D4A574',
                                fontWeight: 500,
                              },
                              children: proj.name,
                            },
                          },
                          {
                            type: 'div',
                            props: {
                              style: {
                                fontSize: '9px',
                                color: 'rgba(255, 255, 255, 0.35)',
                              },
                              children: `(${proj.count})`,
                            },
                          },
                        ].filter(Boolean),
                      },
                    })),
                  ],
                },
              }
            : null,
          // Footer
          {
            type: 'div',
            props: {
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '12px',
                marginTop: 'auto',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
              },
              children: [
                {
                  type: 'div',
                  props: {
                    style: { fontSize: '10px', color: 'rgba(255, 255, 255, 0.2)' },
                    children: '#buildinpublic',
                  },
                },
                {
                  type: 'div',
                  props: {
                    style: { fontSize: '9px', color: 'rgba(255, 255, 255, 0.15)' },
                    children: 'Powered by Claude',
                  },
                },
              ],
            },
          },
        ].filter(Boolean),
      },
    },
    {
      width: 480,
      height: 300,
      fonts: [
        { name: 'Inter', data: fonts.regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fonts.semiBold, weight: 600, style: 'normal' },
        { name: 'Inter', data: fonts.bold, weight: 700, style: 'normal' },
      ],
    }
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 960 },
  });

  return resvg.render().asPng();
}

function buildTaskItem(task: TaskSummary, color: string): object {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontSize: '11px',
              fontWeight: 600,
              color,
            },
            children: task.name,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.5)',
            },
            children: task.description,
          },
        },
      ],
    },
  };
}

function buildStat(value: string, label: string, color: string): object {
  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '45px',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontSize: '22px',
              fontWeight: 700,
              color: value === '—' ? 'rgba(255, 255, 255, 0.2)' : color,
              lineHeight: 1,
            },
            children: value,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              fontSize: '9px',
              color: 'rgba(255, 255, 255, 0.35)',
              marginTop: '3px',
            },
            children: label,
          },
        },
      ],
    },
  };
}

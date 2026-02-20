# OpenClaw Setup Notes

## What is OpenClaw?

Open-source personal AI assistant that runs on your own devices and connects to messaging platforms (Telegram, Signal, Discord, WhatsApp, etc.). Created by Peter Steinberger, recently moved to an open-source foundation.

**Key features:**
- Computer access — can execute tasks, write code, modify configs
- Memory — persistent context across conversations
- "Heartbeat" — proactive monitoring, not just reactive responses
- Multi-platform messaging integration

**Links:**
- https://openclaw.ai/
- https://github.com/openclaw/openclaw
- Pi setup guide: https://toclawdbot.com/raspberry-pi

---

## Raspberry Pi 5 Setup

**Your hardware:** Pi 5 with 8GB RAM (ideal spec)

**Requirements:**
- 64-bit Raspberry Pi OS (Lite recommended)
- Node.js 20+
- 64GB+ SD card (A2-rated) or USB SSD
- Official power supply
- Active cooling recommended

**Installation:**
1. Flash 64-bit Pi OS Lite
2. Install Node.js via NodeSource or nvm
3. Clone OpenClaw repo and build from source
4. Run onboarding wizard (first start takes 2-5 min on Pi)
5. Configure systemd service for auto-start on reboot

**Security tip:** Running on dedicated Pi provides isolation from main workstation.

---

## Use Case Ideas

### Quizio (quizio.io)

| Use Case | Description |
|----------|-------------|
| **Server monitoring** | Alert via Telegram/Discord when PartyKit WebSocket issues occur |
| **Daily stats** | "47 games played, most popular: Countries" |
| **Content pipeline** | "Add a quiz about 90s sitcoms" → generates and inserts to Supabase |
| **Data validation** | Check for duplicate answers, broken aliases |
| **Game invites** | Forward invites through messaging, "start game with usual crew" |
| **DB cleanup** | Scheduled removal of old game sessions |

### Personal-site (alansee.dev)

| Use Case | Description |
|----------|-------------|
| **Work items via chat** | "Add work item: fix Safari animation" → creates in Supabase |
| **Status updates** | "What's on my plate?" / "Mark calendar bug done" |
| **Stale item nudges** | "3 items pending 2+ weeks" |
| **Dev diary automation** | Generate entries from commits + work completions |
| **Book additions** | "Add Project Hail Mary, 5 stars" → enriches via Google Books API |
| **Blog drafts** | "Draft post about OpenClaw setup" → creates markdown |
| **Site health** | Monitor Vercel builds, alert on failures |

**Why personal-site is a good fit:** Already has Supabase work tracking, Claude commands, dev diary system. OpenClaw becomes a natural language interface accessible from phone.

---

## Next Steps

1. Get Pi 5 booted with 64-bit OS Lite
2. Install Node.js 20+
3. Clone and build OpenClaw
4. Run onboarding wizard
5. Connect a messaging platform (Telegram is easiest to start)
6. Test basic interactions
7. Set up Supabase connection for personal-site integration
8. Build custom automations for work tracking

---

## Open Questions to Explore

- Which messaging platform to use as primary interface?
- How to securely connect to Supabase from Pi?
- What LLM API to use (Claude API, OpenAI, local model)?
- Rate limits / costs for LLM API calls?

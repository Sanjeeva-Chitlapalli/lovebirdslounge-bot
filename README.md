# LoveBirds Lounge Bot

> An AI-powered LINE group chat bot for **LoveBirds Lounge** 🐦  
> Built with **Node.js · Express · MongoDB · Gemini AI · LINE Bot SDK**

---

## Features

| Feature | Description |
|---|---|
| 🔔 **Smart Reminders** | AI extracts reminders from natural language, stores them, and pushes to LINE at the right time |
| 💛 **Memory System** | Bot remembers facts about your group (dates, preferences, plans) |
| 🤖 **@Mention Reply** | Tag the bot to get context-aware AI replies in Thai |
| 📊 **Weekly Summary** | Auto-generates a weekly recap for the group every Sunday |
| 🌐 **Admin Portal** | Web dashboard to view/manage reminders and memories |

---

## Project Structure

```
/src
  /routes         webhook.js, portal.js
  /services       extractionService.js, mentionService.js, reminderService.js, lineService.js
  /models         Nest.js, Message.js, Reminder.js, Memory.js
  /jobs           reminderCron.js, summaryCron.js
  /prompts        extraction.js, reminder.js, mention.js, summarize.js
/public           index.html, confirm.html
app.js
.env.example
```

---

## Quick Start

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in your credentials
```

### 3. Start

```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | HTTP server port (default: 3000) |
| `MONGODB_URI` | MongoDB connection string |
| `LINE_CHANNEL_ACCESS_TOKEN` | From LINE Developers Console |
| `LINE_CHANNEL_SECRET` | From LINE Developers Console |
| `GEMINI_API_KEY` | Google AI Studio API key |
| `LINE_GROUP_ID` | Target group for push messages |
| `REMINDER_CRON_SCHEDULE` | Cron schedule for reminder checks (default: every minute) |
| `SUMMARY_CRON_SCHEDULE` | Cron schedule for weekly summary (default: `0 21 * * 0`) |
| `BASE_URL` | Public URL for confirmation links |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | LINE platform events |
| `GET` | `/api/reminders` | List upcoming reminders |
| `POST` | `/api/reminders` | Create a reminder manually |
| `DELETE` | `/api/reminders/:id` | Cancel a reminder |
| `GET` | `/api/memories` | List stored memories |
| `GET` | `/api/nests` | List registered groups |
| `POST` | `/api/nests` | Register a new group |
| `GET` | `/api/confirm?token=` | Confirm a reminder from portal link |
| `GET` | `/health` | Health check |

---

## LINE Webhook Setup

1. Go to [LINE Developers Console](https://developers.line.biz/)
2. Set webhook URL to: `https://your-domain.com/webhook`
3. Enable **Use webhook**
4. Disable **Auto-reply messages**

---

## Tech Stack

- **Runtime**: Node.js
- **Web Framework**: Express
- **Database**: MongoDB + Mongoose
- **AI**: Google Gemini (`gemini-1.5-flash`)
- **LINE SDK**: `@line/bot-sdk`
- **Scheduler**: `node-cron`
- **Language**: Thai 🇹🇭 (with English fallback)

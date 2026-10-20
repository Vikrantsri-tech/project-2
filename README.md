# CodeTogether — Real-Time Collaborative Code Editor

A real-time collaborative code editor where multiple users can join a shared room, write code together, chat, run code in 13 languages, and track edit history — all in the browser.

Think of it as a simplified combination of VS Code + Google Docs, built for coding.

## Features

### Level 1 — Basics
- **User signup / login** (email + password, powered by Supabase Auth)
- **Create room** with a short shareable 6-character ID
- **Join room** using a room ID
- **Monaco Editor** (the editor behind VS Code) with syntax highlighting
- **Auto-save** — code is saved to the database as you type
- **13 programming languages** — C++, C, Java, Python, JavaScript, TypeScript, Rust, Go, Ruby, PHP, C#, Swift, Bash
- **Run code** — execute your code with custom stdin input
- **Download code** — export your solution as a file

### Level 2 — Real-time collaboration
- **Live code sync** — when one user edits, all others in the room see it instantly (via Supabase Realtime / Postgres Changes)
- **No refresh needed** — changes stream over WebSockets automatically

### Level 3 — Advanced
- **User presence** — see how many people are in the room
- **Real-time chat** — talk to your collaborators without leaving the editor
- **Shareable rooms** — copy the room ID and share it with friends
- **Code history** — a log of who saved code and when
- **Problem statements** — a mini LeetCode-style problem set with difficulty levels (Easy / Medium / Hard) and one-click problem loading into the editor
- **Code execution** — code runs via a sandboxed execution service (Piston API), never on your own server

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Vite |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Backend / Database / Auth | Supabase (PostgreSQL + Realtime + Auth) |
| Code Execution | Piston API (via Supabase Edge Function proxy) |

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (database + auth are already configured)

### Install & Run
```bash
npm install
npm run dev
```

### Build for Production
```bash
npm run build
npm run preview
```

## Database Schema

The app uses three tables (all with Row Level Security enabled):

- **`rooms`** — collaborative rooms (room ID, owner, language, code, members)
- **`messages`** — chat messages per room
- **`code_history`** — audit log of code saves per room

## How Real-Time Sync Works

1. User A types in the Monaco editor
2. Code is debounced (800ms) and saved to the `rooms` table
3. Supabase Realtime detects the UPDATE via Postgres Changes
4. The change is broadcast to all users subscribed to that room's channel
5. User B's editor updates instantly — no refresh needed

## How Code Execution Works

1. User clicks "Run Code"
2. The frontend calls a Supabase Edge Function (`run-code`)
3. The edge function proxies the request to the [Piston API](https://emkc.org/api/v2/piston) (a free sandboxed code execution service)
4. The result (stdout, stderr, exit code) is returned and displayed

User code never runs on your own server — it's always sandboxed by the Piston API.

## Project Structure

```
src/
├── components/
│   ├── AuthScreen.tsx      # Login / signup screen
│   ├── LandingPage.tsx     # Create / join room
│   └── RoomPage.tsx        # Main editor + chat + problems + output
├── context/
│   └── AuthContext.tsx     # Auth state provider
├── lib/
│   ├── supabase.ts         # Supabase client
│   ├── types.ts            # TypeScript types
│   ├── languages.ts        # Language definitions + boilerplate
│   └── problems.ts         # Coding problem set
├── App.tsx                 # Root component + routing
├── main.tsx                # Entry point
└── index.css               # Tailwind CSS

supabase/
└── functions/
    └── run-code/
        └── index.ts        # Edge function: code execution proxy
```

## License

MIT

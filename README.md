# Speak Language Learning App

A mobile-first web app for practicing a new language out loud. Pick a course, open a lesson,
tap **Record**, and see what you said transcribed live as you speak.

![Course list, course page, recording in progress, and the final transcript](docs/screenshots.png)

> Built on Speak's speech recognition API. Not an official Speak product.

## Features

- **Courses and lessons:** browse courses in Korean, Spanish and French, each with its own lessons.
- **Live transcription:** speech streams to a speech recognition service over a WebSocket, and the
  transcript updates word by word as results come back.
- **Recording feedback:** live waveform, a timer, interim vs. final transcript styling, and stopping
  early at any point.
- **Clear errors:** connection drops, timeouts and service errors show readable messages with a retry.
- **Accessible:** screen-reader announcements, keyboard support, WCAG AA contrast and
  reduced-motion support.

## Tech stack

| Layer | Tools |
| --- | --- |
| Client | React 19, TypeScript, Vite, React Router |
| Server | Node.js, Express 5, `ws` |
| Shared | TypeScript types for the REST API and WebSocket protocol |
| Testing | Vitest (24 tests) |

## Prerequisites

- Node.js 22 or newer (see `.nvmrc`; with nvm, run `nvm use`)
- npm 10 or newer (ships with Node 22)

## Installation

```bash
git clone https://github.com/kylekapoor/speak-language-learning-app.git
cd speak-language-learning-app
npm install
cp server/.env.example server/.env
```

## Running the app

```bash
npm run dev:mock
```

Open http://localhost:5173 in a phone-sized window (the UI is built for mobile viewports).

| Command | Description |
| --- | --- |
| `npm run dev:mock` | Run with a local speech recognition mock (no network needed) |
| `npm run dev` | Run against the live speech recognition host |
| `npm run build && npm start` | Production build, served from http://localhost:3001 |
| `npm test` | Run the test suite |
| `npm run typecheck` | Type-check client and server |

> The live staging host currently rejects every session with `asrError: matchingRequired`, so
> `npm run dev:mock` is the way to see the full recording flow. Both modes run the same code.

## Configuration

Environment variables are read from `server/.env`. The values in `server/.env.example` work as is.

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Port for the API, WebSocket proxy and production client |
| `ASR_MODE` | `live` | `live` uses the upstream host below; `mock` starts a local mock |
| `ASR_UPSTREAM_URL` | required in `live` | Upstream speech recognition WebSocket URL |
| `ASR_ACCESS_TOKEN` | required in `live` | Sent as the `X-Access-Token` header on the upstream handshake |
| `ASR_CLIENT_INFO` | required in `live` | Sent as the `X-Client-Info` header on the upstream handshake |

The credentials stay on the server; the browser never sees them.

## How it works

```
React pages ── GET /api/... ──▶ Express ──▶ course data (read-only)

Recording ── WS /ws/asr ──▶ proxy ── WS + auth headers ──▶ speech recognition (or mock)
```

- **REST API:** `GET /api/courses`, `/api/courses/:courseId` and
  `/api/courses/:courseId/lessons/:lessonId` serve read-only course data, with JSON 404s.
- **WebSocket proxy:** browsers can't set custom headers on a WebSocket, so the server opens the
  upstream connection with the credentials and relays messages both ways. It validates messages,
  only accepts same-origin connections, and keeps both sides' lifetimes in sync.
- **Recording:** a mock microphone replays a sample clip at real-time pace, and a small controller
  outside React runs the session protocol, with a pure state machine driving the UI.

## Project structure

```
client/src/   pages, components, recording session (asr/), audio helpers (audio/)
server/src/   Express app, course routes, WebSocket proxy and mock (asr/)
server/data/  course data
shared/       types shared by client and server
```

## Roadmap

- Record from a real microphone.
- Compare the transcript with the lesson's phrase and highlight missed words.
- Automatic reconnects, rate limiting and authentication on the proxy.

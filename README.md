# Job Hunt Copilot

An AI-powered job application assistant for fresh graduates. Paste your resume and a job description — get tailored bullets, a professional summary, cover letter opener, and interview prep in under 2 minutes.

## Features

- **Tailored bullets** matched to the exact job description
- **Fit assessment** — strong / moderate / stretch
- **Cover letter opener** — specific, not generic
- **Interview prep** — likely questions based on your bullets
- **Coaching notes** — builds across sessions
- **Application history** — every session saved locally

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or later)
- A free [Groq API key](https://console.groq.com/keys)

### Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173 and enter your Groq API key when prompted.

### Build for production

```bash
npm run build
```

The output goes to the `dist/` folder — ready to deploy anywhere.

## API Key

This app uses [Groq's free API](https://console.groq.com) (Llama 3.3 70B). Each user enters their own key — it is stored only in their browser's localStorage and never sent to any server other than Groq directly.

To get a key:
1. Go to [console.groq.com](https://console.groq.com)
2. Sign up (free)
3. Go to API Keys → Create API Key
4. Paste it into the app

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Run `npm run build`
3. Deploy the `dist/` folder — or use the GitHub Actions workflow below

## Tech stack

- React 18
- Vite 5
- Groq API (Llama 3.3 70B)
- localStorage for persistence (no backend needed)

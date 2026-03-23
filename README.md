# Second Soul

A browser-based AI chat client with persona management. No backend required — all data is stored locally in IndexedDB. Supports OpenAI-compatible APIs, Anthropic, OpenRouter, Mistral, NanoGPT, and Ollama.

Licence: GPL-3.0

---

## Project Structure

```
frontend/   # React + Vite PWA (the chat client)
backend/    # Go CORS proxy (required for Ollama Cloud only)
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/)
- [Go](https://go.dev/) 1.22+ (only needed for the proxy)
- [Docker](https://www.docker.com/) + [Compose](https://docs.docker.com/compose/) (for production deployment)

---

## Development

### Frontend

```bash
cd frontend
pnpm install
pnpm dev        # starts Vite dev server at http://localhost:5173
```

### Ollama Cloud proxy (optional)

Only needed if you want to use [Ollama Cloud](https://ollama.com) from the browser.
The proxy is a thin passthrough — it adds CORS headers and forwards requests unchanged.

```bash
cd backend
cp .env.example .env
# Edit .env as needed, then:
ALLOWED_UPSTREAM_URLS=https://ollama.com \
ALLOWED_ORIGINS=http://localhost:5173 \
PORT=8081 \
go run .
```

The proxy will be available at `http://localhost:8081`.

---

## Production Deployment (Docker Compose)

```bash
cp backend/.env.example backend/.env
# Edit backend/.env: set ALLOWED_ORIGINS to your public frontend domain
docker compose up -d --build
```

| Service  | Port | Description             |
|----------|------|-------------------------|
| frontend | 80   | nginx serving the PWA   |
| proxy    | 8081 | Ollama Cloud CORS proxy |

For HTTPS (strongly recommended), place nginx or Caddy in front of both services.

---

## Environment Variables — Proxy

| Variable               | Required | Default | Description                                                                 |
|------------------------|----------|---------|-----------------------------------------------------------------------------|
| `ALLOWED_UPSTREAM_URLS`| yes      | —       | Comma-separated list of upstream base URLs the proxy may forward to         |
| `ALLOWED_ORIGINS`      | no       | —       | Comma-separated browser Origins allowed to use the proxy (empty = no check) |
| `PORT`                 | no       | `8080`  | Port the proxy listens on                                                   |

Example:

```env
ALLOWED_UPSTREAM_URLS=https://ollama.com
ALLOWED_ORIGINS=https://your-domain.com,http://localhost:5173
PORT=8080
```

---

## Adding Ollama Cloud as a Provider

1. Deploy the proxy (see above) and note its public URL
2. In Second Soul → Settings → Providers → Add Provider:
   - **Name:** Ollama Cloud
   - **Base URL:** `https://your-proxy.example.com/v1`
   - **API Key:** your Ollama API key
   - **Adapter:** Ollama Cloud (via proxy)
3. Click **Sync Models** to load the available model list

### Why a proxy?

Ollama Cloud does not send CORS headers, so browsers cannot call it directly.
The proxy is a zero-data-retention passthrough: it adds CORS headers and forwards
every request byte-for-byte to `https://ollama.com` without logging, caching, or
modifying the payload. The API key never leaves the browser except as part of the
forwarded request. You are encouraged to run your own proxy instance.

---

## Supported Providers (direct, no proxy needed)

| Provider   | Adapter              | Model Sync |
|------------|----------------------|------------|
| OpenAI     | OpenAI-compatible    | yes        |
| Anthropic  | Anthropic            | —          |
| OpenRouter | OpenAI-compatible    | yes        |
| Mistral    | OpenAI-compatible    | yes        |
| NanoGPT    | OpenAI-compatible    | yes        |
| Ollama (local) | Ollama (local)  | yes        |
| Ollama Cloud | Ollama Cloud (via proxy) | yes  |

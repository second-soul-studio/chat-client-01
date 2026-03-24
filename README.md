# Second Soul

A browser-based AI chat client with persona management. No backend required — all data is stored locally in IndexedDB. Supports OpenAI-compatible APIs, Anthropic, OpenRouter, Mistral, NanoGPT, and Ollama.

Licence: GPL-3.0

---

## Project Structure

```
frontend/   # React + Vite PWA (the chat client)
backend/    # Go CORS proxy (required for Ollama Cloud and Brave Search)
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
cp config.js.example public/config.js
# Edit public/config.js if your proxy runs on a different port
pnpm dev        # starts Vite dev server at http://localhost:5173
```

Or use the convenience script:

```bash
cd frontend && ./start.sh
```

### Proxy

The proxy is required for providers and tools that enforce strict CORS policies — currently **Ollama Cloud** and **Brave Search**. It is a thin passthrough that adds CORS headers and forwards requests unchanged.

```bash
cd backend
./start.sh
# Starts the proxy on port 9080 with Ollama Cloud + Brave Search allowed
```

Or manually:

```bash
cd backend
ALLOWED_UPSTREAM_URLS=https://ollama.com,https://api.search.brave.com \
ALLOWED_ORIGINS=http://localhost:5173 \
PORT=9080 \
go run .
```

The proxy will be available at `http://localhost:9080`. Make sure `public/config.js` points to the same port:

```js
window.__ENV__ = {
  PROXY_URL: 'http://localhost:9080',
};
```

---

## Production Deployment (Docker Compose)

```bash
# Edit compose.yml:
#   - Set PROXY_URL in the frontend service to the public proxy URL
#   - Set ALLOWED_ORIGINS in the proxy service to your public frontend domain
docker compose up -d --build
```

| Service  | Port | Description                         |
|----------|------|-------------------------------------|
| frontend | 80   | nginx serving the PWA               |
| proxy    | 8081 | CORS proxy (Ollama Cloud, Brave Search) |

For HTTPS (strongly recommended), place nginx or Caddy in front of both services.

---

## Environment Variables

### Frontend

The frontend reads runtime config from `/config.js`, which is generated at container start (Docker) or provided manually (development).

| Variable     | Required | Default | Description                                               |
|--------------|----------|---------|-----------------------------------------------------------|
| `PROXY_URL`  | no       | `""`    | Base URL of the CORS proxy. Empty = same-origin routing.  |

**Development:** Copy `frontend/config.js.example` to `frontend/public/config.js` and set `PROXY_URL` to your local proxy address (e.g. `http://localhost:9080`).

**Docker:** Set via `environment: - PROXY_URL=https://...` in `compose.yml`. The entrypoint script generates `/config.js` automatically at container start.

### Proxy

| Variable               | Required | Default | Description                                                                 |
|------------------------|----------|---------|-----------------------------------------------------------------------------|
| `ALLOWED_UPSTREAM_URLS`| yes      | —       | Comma-separated list of upstream base URLs the proxy may forward to         |
| `ALLOWED_ORIGINS`      | no       | —       | Comma-separated browser Origins allowed to use the proxy (empty = no check) |
| `PORT`                 | no       | `8080`  | Port the proxy listens on                                                   |

Example:

```env
ALLOWED_UPSTREAM_URLS=https://ollama.com,https://api.search.brave.com
ALLOWED_ORIGINS=https://your-domain.com,http://localhost:5173
PORT=9080
```

---

## Adding Ollama Cloud as a Provider

1. Start the proxy (see above)
2. In Second Soul → Settings → Providers → Add Provider:
   - **Name:** Ollama Cloud
   - **Base URL:** `https://ollama.com`
   - **API Key:** your Ollama API key
   - **Adapter:** Ollama Cloud (via proxy)
3. Click **Sync Models** to load the available model list

### Why a proxy?

Ollama Cloud and Brave Search do not send CORS headers, so browsers cannot call them directly. The proxy is a zero-data-retention passthrough: it adds CORS headers and forwards every request byte-for-byte to the upstream without logging, caching, or modifying the payload. The API key never leaves the browser except as part of the forwarded request. You are encouraged to run your own proxy instance.

---

## Supported Providers (direct, no proxy needed)

| Provider       | Adapter                    | Model Sync |
|----------------|----------------------------|------------|
| OpenAI         | OpenAI-compatible          | yes        |
| Anthropic      | Anthropic                  | —          |
| OpenRouter     | OpenAI-compatible          | yes        |
| Mistral        | OpenAI-compatible          | yes        |
| NanoGPT        | OpenAI-compatible          | yes        |
| Ollama (local) | Ollama (local)             | yes        |
| Ollama Cloud   | Ollama Cloud (via proxy)   | yes        |

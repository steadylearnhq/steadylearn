# Steadylearn

Short, hands-on lessons on distributed systems, databases and the rest of the stack, for working software engineers. Every answer comes with a confidence, scored for calibration.

## Layout

- [`app/`](app/): the web app (Solid + TypeScript, built with Vite)
- [`api/`](api/): the API (Go, Postgres, Redis)

## Running locally

```bash
# API: copy env.sample to .env and fill it in first
cd api && make run

# Web app: copy .env.example to .env and point VITE_API_URL at the API
cd app && npm install && npm run dev   # http://localhost:5173
```

See [`app/README.md`](app/README.md) for more on the web app.

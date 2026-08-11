# BananaCare Web

React/Vite dashboard and browser diagnosis client. It communicates only with `../web-backend` through `VITE_WEB_API_URL` and falls back to a marked demo classifier when that service is unavailable.

```powershell
Copy-Item .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Production check: `npm run build`.

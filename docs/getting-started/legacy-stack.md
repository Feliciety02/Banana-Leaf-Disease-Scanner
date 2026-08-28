# Legacy Demo Stack

This workflow starts the Laravel and React demonstration system. It is not
required to build, launch, or use the stateless Android thesis classifier.

## Docker

Requirements: Docker Desktop and Git.

```powershell
docker compose up --build
```

Open the web application at <http://localhost:4173> and the API health endpoint
at <http://localhost:8001/api/health>.

```powershell
docker compose down
```

Do not use `docker compose down --volumes` unless the Docker-managed demo data
is intentionally being reset.

## Native Development

For detailed environment setup and commands, use:

- [Laravel backend guide](../../backend/README.md)
- [React web guide](../../web-frontend/README.md)

Run Docker or the native API/web processes, not both on the same ports.

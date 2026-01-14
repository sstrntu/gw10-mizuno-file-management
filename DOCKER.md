# Docker Quick Reference

## Quick Start

```bash
# Start the application
docker-compose up

# Start in background (detached mode)
docker-compose up -d

# Stop the application
docker-compose down
```

Access the application at: **http://localhost:3000**

## What's Running

| Service  | Container Name    | Port | URL                       |
|----------|-------------------|------|---------------------------|
| Frontend | mizuno-frontend   | 3000 | http://localhost:3000     |
| Backend  | mizuno-backend    | 5001 | http://localhost:5001/api |

## Useful Commands

```bash
# View logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# View frontend logs only
docker-compose logs -f frontend

# Rebuild containers
docker-compose up --build

# Restart containers
docker-compose restart

# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes
docker-compose down -v

# Check container status
docker-compose ps

# Execute command in backend container
docker exec -it mizuno-backend /bin/bash

# Execute command in frontend container
docker exec -it mizuno-frontend /bin/sh
```

## Architecture

```
Browser (localhost:3000)
    ↓
┌─────────────────────────────┐
│  Nginx (Frontend Container) │
│  Port: 3000                 │
├─────────────────────────────┤
│  • Serves React static files│
│  • Proxies /api/* requests  │
└──────────────┬──────────────┘
               ↓
      /api/* requests proxied to
               ↓
┌─────────────────────────────┐
│  Flask (Backend Container)  │
│  Port: 5001                 │
├─────────────────────────────┤
│  • Filename resolution      │
│  • Directory structure      │
│  • Config-driven logic      │
└─────────────────────────────┘
```

## Environment Detection

The frontend automatically detects the environment:
- **Development** (npm run dev): Connects to `http://localhost:5001`
- **Production** (Docker): Uses relative URLs, proxied by Nginx

## Troubleshooting

### Backend not responding
```bash
# Check backend logs
docker-compose logs backend

# Restart backend
docker-compose restart backend
```

### Frontend showing connection errors
```bash
# Check if both containers are running
docker-compose ps

# Check nginx logs
docker-compose logs frontend
```

### Port conflicts
If ports 3000 or 5001 are already in use, edit `docker-compose.yml`:
```yaml
ports:
  - "8080:80"  # Change frontend to port 8080
  # or
  - "5002:5001"  # Change backend to port 5002
```

### Rebuild from scratch
```bash
# Remove everything and rebuild
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

## Development vs Production

### Development (Current Setup)
- Uses Flask dev server (not for production)
- Debug mode enabled
- Hot-reload on code changes (requires rebuild)

### For Production Deployment
Consider using:
- **Backend**: Gunicorn or uWSGI instead of Flask dev server
- **Environment**: Production environment variables
- **Security**: Remove debug mode, add authentication
- **Volumes**: Mount config as read-only volume if configs change frequently

Example production backend:
```dockerfile
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "src.api:app"]
```

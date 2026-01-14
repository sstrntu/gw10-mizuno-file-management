---
description: How to deploy the Mizuno File Management app to DigitalOcean
---

# Deployment to DigitalOcean

This workflow describes how to deploy the application to `mz-file.turfmapp.com` on the DigitalOcean droplet.

## Prerequisites

1.  **Shared Network**: The Docker network `shared_network` must exist on the droplet.
    ```bash
    docker network create shared_network 2>/dev/null || true
    ```
2.  **Traefik**: Traefik must be running on the droplet and connected to `shared_network`.

## Deployment Steps

### 1. Push Changes (Local Machine)

Commit and push your changes, including the new `docker-compose.prod.yml` and `backend/requirements.txt`:

```bash
git add .
git commit -m "Configure production deployment for mz-file.turfmapp.com"
git push origin main
```

### 2. Connect to Droplet

SSH into your server:

```bash
ssh your-droplet-user@your-droplet-ip
```

### 3. Pull and Deploy (Server)

Navigate to the project directory and pull the latest changes:

```bash
cd /path/to/gw10-mizuno-file-management
# If strictly replacing the repo or updating:
git pull origin main
```

Run the production compose file:

```bash
# Provide the project name explicitly if needed, or just up
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Verify Deployment

Check the logs ensures services are running:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Verify the URL:
- Open [https://mz-file.turfmapp.com](https://mz-file.turfmapp.com)
- Check API: [https://mz-file.turfmapp.com/api/config](https://mz-file.turfmapp.com/api/config)

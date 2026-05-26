# Deploying a Docker Container to EC2 via SSM and sgit

## Overview

This document captures how to build a Docker image on macOS, transfer it to an EC2 instance using sgit and a tar file, and run it — all without SSH, using AWS SSM Session Manager.

---

## Prerequisites

- macOS with Docker Desktop installed
- AWS CLI configured locally (`aws configure`)
- AWS SSM Session Manager plugin installed
- EC2 instance with:
  - SSM Agent running (pre-installed on Amazon Linux 2023)
  - IAM role with `AmazonSSMManagedInstanceCore` policy
  - Docker installed
- sgit-ai installed in a Python container (see Step 4)

---

## Architecture

```
macOS (Apple Silicon)          EC2 (x86_64)
──────────────────────         ─────────────────────
docker buildx (amd64)  →  my-app.tar  →  docker load  →  docker run
                           via sgit
```

---

## Step 1: Create the Application Files

Create the following three files in the same directory:

**`Dockerfile`**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "index.js"]
```

**`package.json`**
```json
{
  "name": "my-app",
  "version": "1.0.0",
  "description": "A simple Node.js app",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

**`index.js`**
```javascript
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from Docker on EC2!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## Step 2: Build the Docker Image

Since the EC2 instance is `x86_64` and the Mac is Apple Silicon (`arm64`), the image must be built explicitly for the correct platform:

```bash
# Verify EC2 architecture first
aws ec2 describe-instances --instance-ids <instance-id> \
  --query 'Reservations[].Instances[].Architecture'
# Returns: ["x86_64"]

# Build for linux/amd64
docker buildx build --platform linux/amd64 -t my-app:latest .
```

---

## Step 3: Save the Image as a Tar File

```bash
docker save -o my-app.tar my-app:latest
```

---

## Step 4: Transfer the Tar to EC2 via sgit

SSM Session Manager does not support direct file transfer, so sgit is used as a relay.

### On your local machine — share the file via sgit

```bash
sgit --token {token} share send --file ./my-app.tar
# Note the share token e.g. "ocean-sunny-3071"
```

### On EC2 via SSM — receive the file

Connect to your EC2 instance:
```bash
aws ssm start-session --target <instance-id>
```

Start a Python container on EC2 with the same volume setup:
```bash
sudo docker run -it --rm \
  -v /home/ssm-user/app:/app \
  -v /home/ssm-user/python-packages:/python-packages \
  -w /app \
  -e PYTHONPATH=/python-packages \
  python:3.11-slim bash
```

Inside the container:
```bash
pip install sgit-ai --target /python-packages
sgit share receive "ocean-sunny-3071"
exit
```

The tar file is now at `/home/ssm-user/app/my-app.tar` on the EC2 instance.

---

## Step 5: Load and Run the Image on EC2

Back in the EC2 SSM session (outside the Python container):

```bash
# Load the image into Docker
sudo docker load -i /home/ssm-user/app/my-app.tar

# Verify it loaded
sudo docker images

# Run the container
sudo docker run -d -p 80:3000 --name my-app my-app:latest

# Verify it's running
sudo docker ps

# Test the endpoint
curl http://localhost:80
# Returns: Hello from Docker on EC2!
```

---

## Useful Commands

```bash
# Stop the container
sudo docker stop my-app

# Start it again
sudo docker start my-app

# Auto-restart on EC2 reboot
sudo docker run -d -p 80:3000 --restart always --name my-app my-app:latest

# Update with a new image
sudo docker stop my-app
sudo docker rm my-app
sudo docker load -i /home/ssm-user/app/my-app.tar
sudo docker run -d -p 80:3000 --restart always --name my-app my-app:latest
```

---

## Notes

- **Apple Silicon Macs** build `arm64` images by default — always use `--platform linux/amd64` for standard EC2 instances.
- **SSM does not support file transfer** — use sgit, S3, or ECR as a relay.
- **Mounting `site-packages` directly** breaks pip — use `--target /python-packages` with `PYTHONPATH` instead.
- For repeatable deployments, consider pushing to **AWS ECR** instead of transferring tar files.

---

## Step 6: Managing Images and Containers via the Host Control API

The EC2 instance runs a FastAPI sidecar (`sp-host-control`) on port `19009` that exposes endpoints for managing containers and executing shell commands. All requests require an API key header.

### Setup

```bash
API="http://35.179.144.73:19009"
KEY="<your-api-key>"
```

### List Running Containers

```bash
curl -s -H "X-API-Key: $KEY" $API/containers/list | jq
```

### List Images

```bash
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"command": "docker images --format json"}' \
  $API/host/shell/execute | jq
```

### Load Image from Tar (after receiving via sgit)

```bash
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"command": "docker load -i /home/ssm-user/app/my-app.tar"}' \
  $API/host/shell/execute | jq
```

### Inspect an Image

```bash
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"command": "docker inspect my-app:latest"}' \
  $API/host/shell/execute | jq
```

### Delete an Image

```bash
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"command": "docker rmi my-app:latest"}' \
  $API/host/shell/execute | jq
```

### Start a Container (Pod)

```bash
curl -s -X POST -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name": "my-app", "image": "my-app:latest", "ports": {"3000": "80"}}' \
  $API/pods | jq
```

### Stop a Container

```bash
curl -s -X POST -H "X-API-Key: $KEY" $API/pods/my-app/stop | jq
```

### Delete a Container

```bash
curl -X DELETE -H "X-API-Key: $KEY" $API/pods/my-app | jq
```

### Get Container Logs

```bash
curl -s -H "X-API-Key: $KEY" "$API/containers/my-app/logs?lines=50" | jq
```

### Get Container Stats

```bash
curl -s -H "X-API-Key: $KEY" $API/containers/my-app/stats | jq
```

---

## Full Local Development Workflow

A summary of the end-to-end flow from local development to running on EC2:

```
1. Build       docker buildx build --platform linux/amd64 -t my-app:latest .
2. Save        docker save -o my-app.tar my-app:latest
3. Share       sgit --token {token} share send --file ./my-app.tar
4. Receive     (on EC2 via Python container) sgit share receive "{token}"
5. Load        curl -X POST $API/host/shell/execute -d '{"command": "docker load -i /home/ssm-user/app/my-app.tar"}'
6. Run         curl -X POST $API/pods -d '{"name": "my-app", "image": "my-app:latest", "ports": {"3000": "80"}}'
7. Verify      curl $API/containers/list
```

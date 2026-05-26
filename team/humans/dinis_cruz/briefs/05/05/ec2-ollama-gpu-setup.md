# EC2 GPU Ollama Stack — Setup Guide

Complete guide to provisioning a GPU EC2 instance running Ollama, Open WebUI, Jupyter, and monitoring from scratch.

---

## 1. Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SSM Session Manager plugin installed locally
- `sp` CLI tool (SGraph Playwright service)
- IAM instance profile with SSM access (e.g. `playwright-ec2`)
- GPU vCPU quota approved for `eu-west-2` (min 4 vCPUs for g4dn.xlarge)

### Request GPU quota (if not already approved)
Go to **AWS Service Quotas → EC2 → Running On-Demand G and VT instances** and request at least **8 vCPUs** in `eu-west-2`. This is usually auto-approved quickly.

---

## 2. Find the Deep Learning AMI

```bash
aws ec2 describe-images \
  --region eu-west-2 \
  --owners amazon \
  --filters \
    "Name=name,Values=Deep Learning Base OSS Nvidia Driver GPU AMI (Amazon Linux 2023)*" \
    "Name=state,Values=available" \
  --query 'sort_by(Images, &CreationDate)[-1].{ID:ImageId,Name:Name}' \
  --output table
```

This AMI comes with NVIDIA drivers, CUDA, and nvidia-container-toolkit pre-installed — no manual driver setup needed.

---

## 3. Launch the EC2 Instance

```bash
aws ec2 run-instances \
  --region eu-west-2 \
  --image-id <ami-id-from-above> \
  --instance-type g4dn.xlarge \
  --iam-instance-profile Name=playwright-ec2 \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":64,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ollama-gpu}]' \
  --metadata-options HttpTokens=required \
  --query 'Instances[0].InstanceId' \
  --output text
```

### Instance specs (g4dn.xlarge)
| Spec | Value |
|---|---|
| vCPUs | 4 |
| RAM | 16 GB |
| GPU | NVIDIA Tesla T4 |
| VRAM | 15 GB |
| Storage | 64 GB gp3 (provisioned above) |
| Cost | ~$0.526/hr on-demand |

Wait for the instance to be ready:
```bash
aws ec2 wait instance-status-ok --instance-ids <instance-id> --region eu-west-2
```

---

## 4. Connect via SSM

```bash
aws ssm start-session --target <instance-id> --region eu-west-2
```

### Verify GPU is working
```bash
nvidia-smi
```
You should see the Tesla T4 with driver version and CUDA version listed.

### Add ssm-user to docker group
```bash
sudo usermod -aG docker ssm-user
```
Exit and reconnect for the change to take effect.

---

## 5. Install Docker Compose

```bash
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Verify
docker compose version
```

---

## 6. Start Ollama with GPU

```bash
docker run -d \
  --name ollama \
  --gpus all \
  -p 11434:11434 \
  -v ollama:/root/.ollama \
  -e OLLAMA_MAX_LOADED_MODELS=1 \
  -e OLLAMA_KEEP_ALIVE=-1 \
  --restart always \
  ollama/ollama
```

### Pull the recommended model

```bash
docker exec -it ollama ollama pull qwen3:14b
```

> **Best model for this setup:** `qwen3:14b` (9.3 GB, fits in T4 VRAM, best balance of quality and speed)

### Verify model is loaded on GPU
```bash
docker exec -it ollama ollama ps
# Should show: qwen3:14b ... 100% GPU
```

### Other available models tested
| Model | Size | Notes |
|---|---|---|
| `qwen3:14b` | 9.3 GB | ✅ Recommended — best quality |
| `gemma4:e4b` | 9.6 GB | Good vision support |
| `qwen2.5-coder:7b` | 4.7 GB | Best for coding tasks |
| `gemma4:31b` | 19 GB | Too large for T4 VRAM |

---

## 7. Start Supporting Containers

### Portainer (Docker management UI)
```bash
docker run -d \
  --name portainer \
  -p 9000:9000 \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce
```

### Open WebUI (Chat UI)
```bash
docker run -d \
  --name open-webui \
  -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -v open-webui:/app/backend/data \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

### Jupyter (Real Python execution)
```bash
docker run -d \
  --name jupyter \
  -p 8888:8888 \
  -v /home/ssm-user/projects:/home/jovyan/work \
  -e JUPYTER_TOKEN=ollama \
  --restart always \
  jupyter/scipy-notebook
```

---

## 8. Monitoring Stack (docker-compose)

Create the config files:

```bash
mkdir -p /home/ssm-user/monitoring
cd /home/ssm-user/monitoring
```

**`docker-compose.yml`:**
```yaml
version: '3'
services:
  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  cadvisor:
    image: gcr.io/cadvisor/cadvisor
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  grafana_data:
```

**`prometheus.yml`:**
```yaml
global:
  scrape_interval: 15s
scrape_configs:
  - job_name: cadvisor
    static_configs:
      - targets: ['cadvisor:8080']
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']
```

Start the monitoring stack:
```bash
docker compose up -d
```

---

## 9. Configure Open WebUI

### Connect Jupyter for real Python execution
1. Go to **Admin Panel → Settings → Code Execution**
2. Set **Code Execution Engine** to `jupyter (Legacy)`
3. Set **Jupyter URL** to `http://host.docker.internal:8888`
4. Set **Jupyter Auth** to `Token` and enter `ollama`
5. Save

### Install custom Python packages in Jupyter
```bash
docker exec -it jupyter pip install sgit-ai
```

### Enable Code Interpreter
1. Go to **Admin Panel → Settings → Code Execution**
2. Toggle **Enable Code Interpreter** on
3. Set engine to `jupyter (Legacy)` with same URL and token as above

---

## 10. Configure Grafana Dashboard

1. Open Grafana at `http://localhost:3001`
2. Login: `admin` / `admin` (change on first login)
3. Go to **Connections → Data Sources → Add data source**
4. Select **Prometheus**
5. Set URL to `http://prometheus:9090`
6. Click **Save & Test**
7. Go to **Dashboards → Import**
8. Enter dashboard ID **14282** (modern cAdvisor dashboard)
9. Select your Prometheus data source and import

---

## 11. Port Forwarding via SSM

Forward all ports in one command:

```bash
for port in 3000 3001 8080 8888 9000 9090; do
  aws ssm start-session \
    --target <instance-id> \
    --document-name AWS-StartPortForwardingSession \
    --parameters "{\"portNumber\":[\"$port\"],\"localPortNumber\":[\"$port\"]}" \
    --region eu-west-2 &
done
```

### Service URLs
| URL | Service |
|---|---|
| http://localhost:3000 | Open WebUI (Chat) |
| http://localhost:3001 | Grafana (Monitoring) |
| http://localhost:8080 | cAdvisor |
| http://localhost:8888 | Jupyter |
| http://localhost:9000 | Portainer |
| http://localhost:9090 | Prometheus |

### Kill all SSM tunnels
```bash
pkill -f "ssm start-session"
```

---

## 12. Auto-restart on Instance Start

Ensure all containers restart automatically:
```bash
docker update --restart always ollama
docker update --restart always open-webui
docker update --restart always portainer
docker update --restart always jupyter
```

For the monitoring stack (docker-compose), add `restart: always` to each service, or run:
```bash
cd /home/ssm-user/monitoring && docker compose up -d
```
after each instance start.

---

## 13. Instance Management

### Stop instance (preserves EBS, stops compute billing)
```bash
aws ec2 stop-instances --instance-ids <instance-id> --region eu-west-2
```

### Start instance
```bash
aws ec2 start-instances --instance-ids <instance-id> --region eu-west-2
```

### After starting — reload model into VRAM
```bash
docker start ollama open-webui portainer jupyter
cd /home/ssm-user/monitoring && docker compose up -d
docker exec -it ollama ollama run qwen3:14b --keepalive -1
```

### Terminate (delete everything)
```bash
aws ec2 terminate-instances --instance-ids <instance-id> --region eu-west-2
```

---

## 14. Cost Summary

| Resource | Cost |
|---|---|
| g4dn.xlarge (running) | ~$0.526/hr |
| g4dn.xlarge (stopped) | $0.00/hr |
| EBS 64GB gp3 | ~$5.63/month |
| **4 hour session** | **~$2.10** |
| **8 hour session** | **~$4.21** |

---

## 15. Recommended Workflow

1. Start instance via AWS console or CLI
2. Run SSM port forwarding loop
3. Pre-warm model: `docker exec -it ollama ollama run qwen3:14b --keepalive -1`
4. Use **Open WebUI** at `http://localhost:3000` for chat + code execution
5. Use **Jupyter** at `http://localhost:8888` for direct notebook work
6. Monitor via **Grafana** at `http://localhost:3001`
7. Stop instance when done to avoid unnecessary charges

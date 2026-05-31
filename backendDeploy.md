# VM Deployment Guide for Devign Backend

This guide outlines the steps to deploy your Node.js, BullMQ, Redis, and MongoDB architecture on a Virtual Machine (e.g., Google Compute Engine, AWS EC2, DigitalOcean Droplet) using Docker Compose.

We will use the newly created `docker-compose.prod.yml` which orchestrates:
1. **API Server** (`devign-api`)
2. **Main Worker** (`devign-worker`)
3. **Build Worker** (`devign-build-worker`)
4. **Redis**
5. **MongoDB**

---

## Prerequisites

Before starting, ensure you have:
1. Provisioned a VM (Ubuntu 22.04 or 24.04 recommended) with at least 4GB RAM.
2. Configured the VM's firewall/security groups to allow inbound traffic on ports `80` (HTTP), `443` (HTTPS), and `22` (SSH). Port `8080` can also be opened if you want to test the API directly without a reverse proxy.

---

## Step 1: Prepare the Virtual Machine

SSH into your VM and install the necessary dependencies (Docker and Git).

```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y docker.io docker-compose-v2

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# (Optional) Add your user to the docker group so you don't need sudo for docker commands
sudo usermod -aG docker $USER
newgrp docker
```

## Step 2: Clone the Repository

Clone your backend repository onto the VM.

```bash
# Clone the repo (replace with your actual repo URL)
git clone <your-repository-url> devign-backend
cd devign-backend
```

## Step 3: Configure Environment Variables

You need to set up your `.env` file and authentication keys on the VM.

1. Copy your `.env` template or create a new one:
   ```bash
   cp .env.example .env
   # Or use a text editor like nano to create it
   nano .env
   ```
2. **Important Environment Variables for VM:**
   Ensure the following variables are set correctly in your `.env` so the containers can communicate with each other:
   ```env
   NODE_ENV=production
   PORT=8080
   REDIS_HOST=redis
   REDIS_PORT=6379
   MONGO_URI=mongodb://mongo:27017/devign
   OLLAMA_HOST=https://your-ollama-host.com
   OLLAMA_API_KEY=your_key_here
   ```
3. **Google Cloud Service Account:**
   If you use Vertex AI or GCS, you need your JSON key.
   Upload your service account JSON file to the VM (e.g., `marine-guard-438713-q1-4a078155e02a.json`). 
   Make sure the path in your `.env` matches where you place it, and you may need to map a volume in `docker-compose.prod.yml` if the file is outside the project folder.

## Step 4: Deploy Using Docker Compose

With the `docker-compose.prod.yml` file ready, you can build and start all services in the background.

```bash
# Build the images and start the containers in detached mode
sudo docker compose -f docker-compose.prod.yml up --build -d
```

### Useful Docker Commands for Maintenance:

*   **View status of all containers:**
    ```bash
    sudo docker compose -f docker-compose.prod.yml ps
    ```
*   **View logs for the API:**
    ```bash
    sudo docker compose -f docker-compose.prod.yml logs -f api
    ```
*   **View logs for the workers:**
    ```bash
    sudo docker compose -f docker-compose.prod.yml logs -f worker build-worker
    ```
*   **Restart the application:**
    ```bash
    sudo docker compose -f docker-compose.prod.yml restart
    ```
*   **Stop the application:**
    ```bash
    sudo docker compose -f docker-compose.prod.yml down
    ```

## Step 5: (Optional but Recommended) Setup Nginx Reverse Proxy

Right now, the API is exposed on port `8080`. For production, it's highly recommended to use Nginx as a reverse proxy on port `80`/`443` and attach an SSL certificate using Let's Encrypt.

```bash
# Install Nginx
sudo apt install -y nginx

# Create a new Nginx configuration
sudo nano /etc/nginx/sites-available/devign
```

Add the following configuration:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com; # Replace with your domain or VM IP

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/devign /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### To Add SSL (HTTPS):
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

---

## Conclusion
Your API server and both background workers are now running reliably on a VM. BullMQ will process jobs continuously without facing CPU throttling issues!

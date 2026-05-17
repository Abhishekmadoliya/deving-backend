#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

PROJECT_ID="marine-guard-438713-q1"
IMAGE_NAME="gcr.io/$PROJECT_ID/devign-backend"
REGION="us-central1" # Or your preferred region

echo "Authenticating to Google Cloud (if needed)..."
# gcloud auth login

echo "Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

echo "Building the Docker image and submitting to Cloud Build..."
gcloud builds submit --tag $IMAGE_NAME

echo "Deploying the API server to Cloud Run..."
gcloud run deploy devign-api \
  --image $IMAGE_NAME \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars="PORT=8080,NODE_ENV=production,VERTEX_KEY_PATH=/secrets/vertex-key.json,GCS_KEY_PATH=/secrets/vertex-key.json" \
  --set-secrets="/secrets/vertex-key.json=marine-guard-key:latest"

echo "Deploying the worker to Cloud Run..."
gcloud run deploy devign-worker \
  --image $IMAGE_NAME \
  --region $REGION \
  --platform managed \
  --no-allow-unauthenticated \
  --command "npm,run,start:worker" \
  --set-env-vars="NODE_ENV=production,VERTEX_KEY_PATH=/secrets/vertex-key.json,GCS_KEY_PATH=/secrets/vertex-key.json" \
  --set-secrets="/secrets/vertex-key.json=marine-guard-key:latest"

echo "Deployment complete!"

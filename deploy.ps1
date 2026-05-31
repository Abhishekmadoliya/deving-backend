# Windows PowerShell Deployment Script for Devign Backend to Google Cloud Run
# Ensure you are logged in to gcloud: gcloud auth login

$PROJECT_ID = "marine-guard-438713-q1"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/devign-backend"
$REGION = "us-central1"
$ENV_FILE = ".env"
$YAML_FILE = "env-vars.yaml"

# 1. Parse .env and generate env-vars.yaml
if (-not (Test-Path $ENV_FILE)) {
    Write-Error "Local .env file not found! Please create one in the root directory before deploying."
    exit 1
}

Write-Host "Parsing local .env file..." -ForegroundColor Cyan
$yamlContent = @()
$hasPort = $false
$hasNodeEnv = $false

Get-Content $ENV_FILE | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line -split '=', 2
        $key = $parts[0].Trim()
        $value = $parts[1].Trim()
        
        # Skip PORT variable as it is reserved in Cloud Run
        if ($key -eq "PORT") {
            return
        }
        
        # Strip outer quotes if any
        $value = $value.Trim("`"").Trim("'")
        
        # Override local-only configuration for production
        if ($key -eq "VERTEX_KEY_PATH" -or $key -eq "GCS_KEY_PATH") {
            $value = "/secrets/vertex-key.json"
        }
        elseif ($key -eq "NODE_ENV") {
            $value = "production"
            $hasNodeEnv = $true
        }
        
        $escapedValue = $value.Replace('"', '\"')
        $yamlContent += "{0}: `"{1}`"" -f $key, $escapedValue
    }
}

if (-not $hasNodeEnv) {
    $yamlContent += 'NODE_ENV: "production"'
}

$yamlContent | Out-File -FilePath $YAML_FILE -Encoding utf8
Write-Host "Generated temporary $YAML_FILE with environment variables." -ForegroundColor Green

try {
    # 2. Set GCP project
    Write-Host "Setting gcloud project to $PROJECT_ID..." -ForegroundColor Cyan
    gcloud config set project $PROJECT_ID
    if ($LASTEXITCODE -ne 0) { throw "Failed to set project." }

    # 3. Build container using Google Cloud Build
    Write-Host "Submitting Docker build to Cloud Build..." -ForegroundColor Cyan
    gcloud builds submit --tag $IMAGE_NAME
    if ($LASTEXITCODE -ne 0) { throw "Cloud Build failed." }

    # 4. Deploy the API server
    Write-Host "Deploying devign-api to Cloud Run..." -ForegroundColor Cyan
    gcloud run deploy devign-api `
      --image $IMAGE_NAME `
      --region $REGION `
      --platform managed `
      --allow-unauthenticated `
      --port 8080 `
      --env-vars-file $YAML_FILE `
      --set-secrets "/secrets/vertex-key.json=marine-guard-key:latest"
    if ($LASTEXITCODE -ne 0) { throw "Deployment of devign-api failed." }

    # 5. Deploy the background worker
    Write-Host "Deploying devign-worker to Cloud Run..." -ForegroundColor Cyan
    gcloud run deploy devign-worker `
      --image $IMAGE_NAME `
      --region $REGION `
      --platform managed `
      --no-allow-unauthenticated `
      --command "npm,run,start:worker" `
      --port 8080 `
      --no-cpu-throttling `
      --min-instances 1 `
      --env-vars-file $YAML_FILE `
      --set-secrets "/secrets/vertex-key.json=marine-guard-key:latest"
    if ($LASTEXITCODE -ne 0) { throw "Deployment of devign-worker failed." }

    Write-Host "Deployment completed successfully!" -ForegroundColor Green
}
catch {
    Write-Error "Deployment failed: $_"
}
finally {
    # Clean up temporary file
    if (Test-Path $YAML_FILE) {
        Remove-Item $YAML_FILE
        Write-Host "Cleaned up temporary environment configuration file." -ForegroundColor Yellow
    }
}

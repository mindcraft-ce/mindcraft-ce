# Vertex AI Setup Guide

This guide will walk you through setting up Google Cloud Vertex AI for use with Mindcraft-CE.

## Prerequisites

- A Google Cloud Project with billing enabled
- The Vertex AI API enabled in your project

## Step 1: Install Google Cloud CLI (gcloud)

### Linux/macOS
```bash
# Download and install gcloud CLI
curl https://sdk.cloud.google.com | bash

# Restart your shell or run:
exec -l $SHELL

# Verify installation
gcloud --version
```

### Windows
Download and run the installer from: [Here](https://cloud.google.com/sdk/docs/install#windows)

## Step 2: Authenticate with Google Cloud

### Initialize gcloud and login
```bash
# Initialize gcloud (this will open a browser for authentication)
gcloud init

# Or if you want to just authenticate without setting defaults:
gcloud auth login
```

### Set up Application Default Credentials
```bash
# This sets up credentials for applications to use
gcloud auth application-default login

# Optional: Set a quota project (recommended)
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

## Step 3: Enable Required APIs

```bash
# Enable the Vertex AI API
gcloud services enable aiplatform.googleapis.com
```

## Step 4: Configure Your Project

### Set default project and region
```bash
# Set your default project
gcloud config set project YOUR_PROJECT_ID

# Set your default region (choose one close to you)
gcloud config set compute/region us-central1
```

### Verify your setup
```bash
# Check your current configuration
gcloud config list

# Test Vertex AI access
gcloud ai models list --region=us-central1
```

## Step 5: Configure Mindcraft-CE

### Update your keys.json file
```json
{
  "VERTEX_PROJECT_ID": "your-actual-project-id",
  "VERTEX_LOCATION": "us-central1"
}
```

## Available Vertex AI Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `gemini-2.5-pro` | Best production model | Complex reasoning, longer context |
| `gemini-2.5-flash` | Latest flash model | General purpose, fast responses |
| `gemini-2.0-flash` | Fast, efficient model | Quick responses, high throughput |
| ------------------ | 3rd Party Models | --------------------------------- |
| `claude-opus-4` | Best Anthropic Model | Extremely complex reasoning, 0 shot game completion* |
| `claude-sonnet-4` | Latest Anthropic Model | Coding model, reasoning |
| `llama-4-maverick-17b-128e-instruct-maas` | Latest Meta Model | Visual Tasks, Diverse environments* |

##### *Has not been tested

**Vertex AI has many more models than Gemini Models**
To see the full list, [go to this page](https://console.cloud.google.com/vertex-ai/model-garden)

You can also deploy any model you want on huggingface through Vertex AI!

Some models may need to be enabled 

## Common Locations

Choose a location close to you for better latency:

- `us-central1` (Iowa, USA)
- `us-east1` (South Carolina, USA)
- `us-west1` (Oregon, USA)
- `europe-west1` (Belgium)
- `europe-west4` (Netherlands)
- `asia-northeast1` (Tokyo, Japan)
- `asia-southeast1` (Singapore)

## Troubleshooting

### Authentication Issues
```bash
# Clear existing credentials and re-authenticate
gcloud auth revoke --all
gcloud auth login
gcloud auth application-default login
```

### Permission Issues
```bash
# Check your current permissions
gcloud projects get-iam-policy YOUR_PROJECT_ID

# You need at least these roles:
# - Vertex AI User (roles/aiplatform.user)
# - Service Account Token Creator (roles/iam.serviceAccountTokenCreator)
```

### API Not Enabled
```bash
# List enabled APIs
gcloud services list --enabled

# Enable Vertex AI if not already enabled
gcloud services enable aiplatform.googleapis.com
```

### Quota Issues
```bash
# Check your quotas
gcloud compute project-info describe --project=YOUR_PROJECT_ID

# Request quota increases in the Google Cloud Console:
# https://console.cloud.google.com/iam-admin/quotas
```

## Security Best Practices

1. **Monitor API usage and costs**
2. **Use Application Default Credentials when possible**
3. **Limit permissions to only what's needed**

## Cost Management

- Monitor your usage in the Google Cloud Console
- Set up billing alerts
- Use quotas to limit API usage
- Consider using smaller models for development/testing such as 2.5-flash-lite

## Environment Variables (Alternative Setup)

If you prefer using environment variables instead of gcloud auth:

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true
```

## Support

- [Google Cloud Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- [Google Gen AI SDK Documentation](https://ai.google.dev/api/generate-content)
- [Google Cloud Support](https://cloud.google.com/support)

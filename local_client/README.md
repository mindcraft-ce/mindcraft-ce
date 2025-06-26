# Andy API Local Client

This directory contains the necessary components to run the local side of the Andy API, allowing you to connect your local Ollama instance to the distributed compute pool and contribute your hardware resources.

## 🚀 Features

*   **Two Operation Modes**:
    *   **Web Interface (Recommended)**: A full-featured, user-friendly Flask application for easy management.
    *   **CLI Client**: A lightweight, terminal-based client for simple, headless operation.
*   **Automatic Model Discovery**: Automatically detects all models available in your local Ollama instance.
*   **Easy Configuration**:
    *   The web UI provides a settings page to configure connection URLs, client behavior, and more.
    *   The CLI client is configured via command-line arguments.
*   **Pool Integration**:
    *   Registers your machine as a compute host in the Andy API pool.
    *   Sends regular health pings to maintain an active connection.
    *   Polls the server for available work (inference jobs) and processes them using Ollama.
*   **Simple Dashboard**: The web UI provides a dashboard to view connection status, enabled models, and basic request statistics.

## 📁 File Overview

*   **`launch.py`**: The main launcher script to start the client in either web or CLI mode.
*   **`app.py`**: The Flask web application that provides the user-friendly interface (web mode).
*   **`andy_host_client.py`**: A basic, command-line-only client for joining the pool (CLI mode).
*   **`requirements.txt`**: A list of all necessary Python dependencies.
*   **`client_config.json`**: The default configuration file for the web interface.
*   **`templates/`**: Contains the HTML templates for the web interface (`index.html`, `models.html`, `metrics.html`, `settings.html`).

## 🛠️ Installation

### Prerequisites

*   Python 3.8+
*   [Ollama](https://ollama.com/) installed and running on your machine.

### Setup

1.  **Install Dependencies**:
    Open your terminal in this directory and run:
    ```bash
    pip install -r requirements.txt
    ```

2.  **Verify Ollama is Running**:
    Make sure the Ollama service is active. You can pull a model to get started:
    ```bash
    ollama pull llama3:8b
    ```

## 🎮 How to Run

You can run the client in two different modes using `launch.py`.

### Option 1: Web Interface (Recommended)

This mode provides a full web UI to manage your client.

1.  **Start the client**:
    ```bash
    python3 launch.py --mode web
    ```

2.  **Access the UI**:
    Open your web browser and navigate to **http://localhost:5000**.

    From the web interface, you can:
    *   Go to the **Models** page to enable the models you want to share.
    *   Go to the **Dashboard** and click "Connect to Pool" to join the network.
    *   Adjust connection settings on the **Settings** page.

### Option 2: Command-Line Client (CLI)

This mode is for users who prefer a lightweight, terminal-only experience.

**Note**: The `launch.py` script for `cli` mode is missing a required argument. Please run the `andy_host_client.py` script directly as shown below.

1.  **Start the client**:
    You must provide a unique `--name` for your host.
    ```bash
    python3 andy_host_client.py --name "my-powerful-pc" --andy-url https://mindcraft.riqvip.dev --url http://localhost:11434
    ```

2.  The client will automatically join the pool and begin sending health pings. To stop it, press `Ctrl+C`.

## ⚙️ Configuration

### Web Interface

The web client can be configured in multiple ways (in order of priority):

1.  **Environment Variables**:
    ```bash
    export ANDY_API_URL="https://mindcraft.riqvip.dev"
    export OLLAMA_URL="http://localhost:11434"
    export FLASK_PORT="5001" # Optional: change the web UI port
    python3 launch.py --mode web
    ```
2.  **Web UI Settings Page**: Changes made in the `/settings` page are saved and will persist.
3.  **`client_config.json` file**: The application loads its default settings from this file on first startup.

### CLI Client

The CLI client is configured exclusively through command-line arguments. Run the following command to see all available options:
```bash
python3 andy_host_client.py --help
```

## 🔧 Troubleshooting

*   **Connection Refused to Ollama**:
    Ensure the Ollama application or `ollama serve` command is running. You can test it with `curl http://localhost:11434`.

*   **"Port Already in Use" (Web Mode)**:
    Another application is using port 5000. You can specify a different one:
    ```bash
    python3 launch.py --mode web --port 5001
    ```

*   **No Models Found**:
    Make sure you have pulled at least one model using the Ollama CLI (e.g., `ollama pull qwen:4b`). In the web UI, you can go to the **Models** page and click "Refresh Models".

*   **Connection Issues to Andy API**:
    *   Check your internet connection and any firewall settings.
    *   Verify the Andy API server URL is correct. The default is `https://mindcraft.riqvip.dev`.
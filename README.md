<div align="center">

# Mindcraft CE

### Intelligent Minecraft agents powered by large language models

Build, run, observe, and experiment with autonomous LLM-powered Minecraft agents using
[Mineflayer](https://github.com/PrismarineJS/mineflayer).

[![CI](https://github.com/mindcraft-ce/mindcraft-ce/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/mindcraft-ce/mindcraft-ce/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.13%2B-green.svg)](https://nodejs.org/)
[![Discord](https://img.shields.io/badge/Discord-Mindcraft%20CE-5865F2)](https://discord.gg/mindcraft-ce)

[Website](https://mindcraft-ce.com) •
[FAQ](docs/FAQ.md) •
[Discord](https://discord.gg/mindcraft-ce) •
[Andy API](https://andy.mindcraft-ce.com) •
[MineCollab](docs/minecollab.md)

</div>

---

## Overview

Mindcraft CE is an experimental community-driven fork of
[Mindcraft](https://github.com/mindcraft-bots/mindcraft) for creating intelligent Minecraft
agents backed by large language models.

Agents can:

- converse with players
- navigate Minecraft environments
- gather resources
- craft and place blocks
- execute multi-step goals
- use persistent conversation memory
- operate with multiple agents
- use vision-capable models
- run benchmark/task scenarios
- connect to local or remote Minecraft servers
- use cloud or locally hosted LLMs
- expose viewers and management interfaces through MindServer
- optionally generate and execute code in a sandboxed environment

Mindcraft CE includes experimental functionality that may not yet exist upstream.

---

## Security Notice

> [!CAUTION]
> Mindcraft can allow an LLM to generate and execute code on the machine running it.
> `allow_insecure_coding` is disabled by default and should remain disabled unless you
> understand the risks.

LLM output must always be considered untrusted input.

Do **not** expose an agent with code execution enabled directly to untrusted players or a
public Minecraft server.

Mindcraft CE applies additional protection around the MindServer control plane:

- MindServer defaults to loopback-only access.
- A non-loopback MindServer bind requires `MINDCRAFT_CONTROL_TOKEN`.
- Docker publishes the MindServer and bot viewers to host loopback by default.
- Public player commands are disabled by default.
- Player command authorization can be restricted using users and ACLs.
- Offline-mode usernames are not trusted for command authorization unless explicitly enabled.

Docker provides useful process isolation but is **not** a complete security boundary for
hostile model-generated code.

---

# Quick Start

## Requirements

You need:

- Minecraft Java Edition
- Node.js **22.13.0 or newer**
- Git, if cloning the repository
- at least one supported LLM provider, or a compatible local model server

Minecraft versions up to and including **1.21.11** are supported by the current development
line. `minecraft_version` defaults to automatic detection.

Check your Node.js version:

```bash
node --version
```

It should report `v22.13.0` or newer.

---

## Native Installation

### 1. Clone Mindcraft CE

```bash
git clone https://github.com/mindcraft-ce/mindcraft-ce.git
cd mindcraft-ce
git checkout develop
```

You can also download a packaged release from the
[Releases](https://github.com/mindcraft-ce/mindcraft-ce/releases) page.

### 2. Install dependencies

For a clean checkout:

```bash
npm ci
```

If you are intentionally updating dependency resolution:

```bash
npm install
```

### 3. Create your key configuration

#### Windows PowerShell

```powershell
Copy-Item keys.example.json keys.json
```

#### Linux / macOS

```bash
cp keys.example.json keys.json
```

Edit `keys.json` and provide the API key for the provider you want to use.

You do **not** need to configure every provider.

### 4. Configure the agent

The default runtime configuration lives in:

```text
settings.js
```

Agent/model profiles live in files such as:

```text
andy.json
profiles/gpt.json
profiles/claude.json
profiles/gemini.json
profiles/llama.json
profiles/qwen.json
profiles/mistral.json
profiles/deepseek.json
```

### 5. Start Minecraft

Create or load a Minecraft Java Edition world and select:

```text
Open to LAN
```

The default configuration expects:

```text
Host: 127.0.0.1
Port: 55916
Authentication: offline
```

If Minecraft chooses a different LAN port, either update `settings.js` or set:

```javascript
"port": -1
```

to enable LAN server discovery.

### 6. Start Mindcraft

```bash
npm start
```

or:

```bash
node main.js
```

The MindServer UI is available by default at:

```text
http://127.0.0.1:8080
```

---

# Docker

Docker is recommended when experimenting with model-generated code or when you want the
Mindcraft runtime isolated from your normal Node.js environment.

## Requirements

Install:

- Docker Desktop on Windows/macOS, or Docker Engine on Linux
- Docker Compose

You still need:

```text
keys.json
settings.js
profiles/
bots/
```

before starting the container.

## Docker Compose

Mindcraft's Docker configuration intentionally binds the application to `0.0.0.0`
**inside the container**, so a control token is mandatory.

The host-side MindServer port remains bound to `127.0.0.1` by default.

### Windows PowerShell

```powershell
$env:MINDCRAFT_CONTROL_TOKEN = `
    [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
docker compose up --build
```

### Linux / macOS

```bash
export MINDCRAFT_CONTROL_TOKEN="$(openssl rand -hex 32)"
docker compose up --build
```

To stop:

```bash
docker compose down
```

## Docker Ports

| Port | Purpose | Host exposure |
|---|---|---|
| `8080` | MindServer UI/control plane | `127.0.0.1` only |
| `3000-3003` | Bot viewers | `127.0.0.1` only |
| `25568` | ViaProxy, when enabled | configurable |

## Connecting Docker to Minecraft on the Host

Inside a container, `127.0.0.1` refers to the container itself.

Use:

```javascript
"host": "host.docker.internal"
```

The Compose configuration provides the host gateway mapping automatically.

## ViaProxy

```bash
docker compose --profile viaproxy up --build
```

See `services/viaproxy/README.md`.

---

# Configuration

The main application configuration is `settings.js`.

Default security-sensitive values include:

```javascript
{
    "minecraft_version": "auto",
    "host": "127.0.0.1",
    "port": 55916,
    "auth": "offline",
    "mindserver_port": 8080,
    "auto_open_ui": true,
    "allow_public_commands": false,
    "command_users": [],
    "command_acl": {},
    "allow_offline_command_acl": false,
    "allow_insecure_coding": false,
    "allow_vision": false
}
```

---

# MindServer Security

MindServer defaults to loopback-only access.

Recognized loopback hosts include:

```text
localhost
127.0.0.0/8
::1
```

Non-loopback binds such as `0.0.0.0`, `::`, LAN addresses, or other externally reachable
interfaces require `MINDCRAFT_CONTROL_TOKEN`.

PowerShell example:

```powershell
$env:MINDCRAFT_BIND_HOST = "0.0.0.0"
$env:MINDCRAFT_CONTROL_TOKEN = `
    [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
npm start
```

Do not expose MindServer directly to the public Internet without an additional trusted access
boundary such as a VPN, firewall, or authenticated TLS reverse proxy.

---

# Player Command Authorization

Mindcraft CE defaults to a fail-closed player command policy.

```javascript
"allow_public_commands": false,
"command_users": [],
"command_acl": {},
"allow_offline_command_acl": false
```

Offline-mode usernames can be spoofed, so offline ACL trust remains disabled unless explicitly
enabled.

---

# Models and Providers

Mindcraft CE supports hosted APIs, OpenAI-compatible endpoints, and local model servers.

| Provider | API key |
|---|---|
| Andy API | `ANDY_API_KEY` *(optional)* |
| OpenAI | `OPENAI_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| xAI | `XAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Qwen | `QWEN_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Replicate | `REPLICATE_API_KEY` |
| Groq | `GROQCLOUD_API_KEY` |
| Hugging Face | `HUGGINGFACE_API_KEY` |
| Novita | `NOVITA_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Hyperbolic | `HYPERBOLIC_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| Inception / Mercury | `MERCURY_API_KEY` |
| Ollama | none |
| LM Studio | none |
| vLLM | endpoint-dependent |

Never commit `keys.json`.

## Andy API

OpenAI-compatible API base:

```text
https://andy.mindcraft-ce.com/api/v1/
```

The default profile uses `andy/auto`.

---

# Multiple Agents

Multiple profiles can be launched together:

```javascript
"profiles": [
    "./profiles/gpt.json",
    "./profiles/claude.json",
    "./profiles/gemini.json"
]
```

MindServer coordinates the running agents.

---

# Tasks

Run a task with:

```bash
node main.js --task_path tasks/basic/single_agent.json --task_id gather_oak_logs
```

For larger automated experiments and multi-agent tasks, see
[MineCollab](docs/minecollab.md).

---

# Development

Install exact locked dependencies:

```bash
npm ci
```

Run:

```bash
npm start
```

Lint:

```bash
npm run lint
```

Test:

```bash
npm test
```

Clean reinstall:

```bash
npm run reinstall
```

---

# Repository Layout

```text
mindcraft-ce/
├── main.js
├── settings.js
├── keys.example.json
├── andy.json
├── profiles/
├── bots/
├── src/
├── tasks/
├── docs/
├── services/
├── docker-compose.yml
├── Dockerfile
├── package.json
└── tests/
```

---

# Troubleshooting

## Dependency installation fails

Confirm Node.js is **22.13.0 or newer**:

```bash
node --version
```

See [FAQ → Common Issues](docs/FAQ.md#common-issues).

## Bot cannot find the LAN world

Check the host, LAN port, firewall, and whether the world is actually open to LAN.

Automatic LAN discovery can be enabled with:

```javascript
"port": -1
```

## Docker cannot connect to Minecraft

Use:

```javascript
"host": "host.docker.internal"
```

instead of container-local `127.0.0.1`.

## Docker requires `MINDCRAFT_CONTROL_TOKEN`

This is intentional. The in-container MindServer bind is non-loopback.

PowerShell:

```powershell
$env:MINDCRAFT_CONTROL_TOKEN = `
    [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
docker compose up --build
```

---

# Branches

- `stable` — known-good snapshots
- `develop` — primary active development branch
- experimental branches — feature work pending reconciliation

Normal contributions should target `develop` unless maintainers request otherwise.

---

# Contributing

Typical workflow:

```bash
git checkout develop
git pull
git checkout -b feature/my-change
```

Validate changes before opening a PR:

```bash
npm run lint
npm test
```

Keep pull requests focused and include what changed, why it changed, testing performed,
compatibility considerations, and dependencies.

---

# Support

- [FAQ](docs/FAQ.md)
- [MineCollab](docs/minecollab.md)
- [Discord](https://discord.gg/mindcraft-ce)
- [Website](https://mindcraft-ce.com)
- [Andy API](https://andy.mindcraft-ce.com)

---

# License

Mindcraft CE is distributed under the [MIT License](LICENSE).

Copyright © 2024 Kolby Nottingham and project contributors.

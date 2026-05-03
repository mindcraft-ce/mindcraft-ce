<div>
<h1 align="center">🧠Mindcraft CE⛏️</h1>


<p align="center">Crafting minds for Minecraft with LLMs and <a href="https://prismarinejs.github.io/mineflayer/#/">Mineflayer!</a></p>
<p align="center">The experimental version of <a href="https://github.com/mindcraft-bots/mindcraft">Mindcraft!</a>

<p align="center">
  <a href="docs/FAQ.md#common-issues">FAQ</a> | 
  <a href="https://discord.gg/mindcraft-ce">Discord Support</a> | 
  <a href="https://mindcraft-ce.com">Website</a> | 
  <a href="https://andy.mindcraft-ce.com">Andy API</a>
<br>
  <a href="https://www.youtube.com/watch?v=gRotoL8P8D8">Video Tutorial</a> | 
  <a href="https://kolbynottingham.com/mindcraft/">Blog Post</a> | 
  <a href="https://mindcraft-minecollab.github.io/index.html">Paper Website</a> | 
  <a href="https://github.com/mindcraft-bots/mindcraft/blob/main/minecollab.md">MineCollab</a>
</p>
</div>

> [!Caution]
Do not connect this bot to public servers with coding enabled. This project allows an LLM to write/execute code on your computer. The code is sandboxed, but still vulnerable to injection attacks. Code writing is disabled by default, you can enable it by setting `allow_insecure_coding` to `true` in `settings.js`. Ye be warned.

# New Experimental Features

Mindcraft CE is the experimental fork of Mindcraft, featuring unique implementations and unmerged PRs from the original repository. Each branch offers distinct features not found in others.

| Branch | Focus | Status | Key Features |
|--------|-------|--------|--------------|
| `stable` | Production ready | Stable | Confirmed working snapshot |
| [`develop`](#develop) | Active development | Beta | Upstream + extra/unique content |
| [`r0.1`](#revamp-01) | Complete revamp | Experimental | Ground-up redesign |
| [`agent-system`](#agent-system) | AI tooling | Experimental | Function calling, RAG, tool-based prompting |

> [!Warning]
> Some of the new features may not work right, proceed at your own risk. If you encounter problems, consider contributing by submitting a pull request to the corresponding branch.

## Develop

This is the default branch, but you can still access it [here](https://github.com/mindcraft-ce/mindcraft-ce/tree/develop).

### 🦙 Andy API
The [Andy API](https://andy.mindcraft-ce.com/) is a distributed framework that allows people to donate their resources to a **public pool** for anyone to access AI models donors wish to contribute. It is used by default in the `andy.json` profile on mindcraft-ce.

The Andy API works **completely free** without an API key:
- 5 concurrent requests
- 1000 requests per day
- No authentication required

Get an optional API key from [Developer Console](https://andy.mindcraft-ce.com/api-keys) for higher limits:
- 10 concurrent requests
- Unlimited daily requests

> [!Note]
> The Andy API does not currently support embeddings through Mindcraft due to a server-side bug. It will be added at a later date.

## Revamp 0.1

You can access this on the [r0.1](https://github.com/mindcraft-ce/mindcraft-ce/tree/r0.1) branch.

A possible plan (not set in stone) to rework mindcraft in its entirety. This could potentially become the new core architecture of mindcraft-ce, separating all the current additions. If completed, v0.1 will be released.

## Agent System

You can access this on the [agent-system](https://github.com/mindcraft-ce/mindcraft-ce/tree/agent-system) branch.

### 🔧 Function Calling
- **`use_function_calling`** — New tool-based AI interaction system in `settings.js`
- Enables structured tool calls instead of text-based commands
- Supported across Claude, GPT, Gemini, Grok, DeepSeek, and Mistral models

### 🧠 RAG System (Retrieval-Augmented Generation)
- **LanceDB Integration** — Vector database for intelligent context retrieval
- **RAGManager** — New class for handling memory and knowledge retrieval

### 🛠️ Tool-Based Prompting
- Modular prompt system with separate XML templates:
  - `conversing.xml`, `coding.xml`, `bot_responder.xml`
  - `image_analysis.xml`, `saving_memory.xml`
- `_default.tools.json` — New tool-based profile configuration
- `_default.commands.json` — Legacy command-based system (still supported)

### 👁️ Enhanced Vision & Models
- Improved vision request handling across all model providers
- Andy API TTS implementation

### 🎯 Other Improvements
- 🐳 Docker support with improved container configuration
- 📊 Multi-agent MineCollab framework
- 🌐 OpenRouter integration for 100+ models

### 🚧 Coming Soon
- **Model Provider Repositories** — Install and update model providers from external repositories via `model_provider_repositories` in `settings.js`
- **Tools Repositories** — Extend bot capabilities with community-created tools via `tools_provider_repositories` in `settings.js`
- Both support auto-install/update and manual management through the Mindserver UI

# Getting Started
## Requirements

- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc) (up to v1.21.11, recommend v1.21.6)
- [Node.js Installed](https://nodejs.org/) (Node v18 or v20 LTS recommended. Node v24+ may cause issues with native dependencies)
- At least one API key from a supported API provider. See [supported APIs](#model-customization). OpenAI is the default.

> [!Important]
> If installing node on windows, ensure you check `Automatically install the necessary tools`
>
> If you encounter `npm install` errors on macOS, see the [FAQ](docs/FAQ.md#common-issues) for troubleshooting native module build issues

## Install and Run

1. Make sure you have the requirements above.

2. Download the [latest release](https://github.com/mindcraft-ce/mindcraft-ce/releases/latest) and unzip it, or clone the repository.

3. Rename `keys.example.json` to `keys.json` and fill in your API keys (you only need one). The desired model is set in `andy.json` or other profiles. For other models refer to the table below.

4. In terminal/command prompt, run `npm install` from the installed directory

5. Start a minecraft world and open it to LAN on localhost port `55916`

6. Run `node main.js` from the installed directory

If you encounter issues, check the [FAQ](docs/FAQ.md#common-issues) or find support on [discord](https://discord.gg/mindcraft-ce). We are currently not very responsive to github issues. To run tasks please refer to [Minecollab Instructions](docs/minecollab.md#installation)


# Configuration
## Model Customization

You can configure project details in `settings.js`. [See file.](settings.js)

You can configure the agent's name, model, and prompts in their profile like `andy.json`. The model can be specified with the `model` field, with values like `model: "gemini-3.1-pro"`. You will need the correct API key for the API provider you choose. See all supported APIs below.

<details>
<summary><strong>⭐ VIEW SUPPORTED APIs ⭐</strong></summary>

<table>
  <thead>
    <tr>
      <th>API Name</th>
      <th>Config Variable</th>
      <th>Docs</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><pre>andy</pre></td>
      <td><pre>ANDY_API_KEY</pre> (optional)</td>
      <td><a href="https://andy.mindcraft-ce.com/andy-docs">docs</a></td>
    </tr>
    <tr>
      <td><pre>openai</pre></td>
      <td><pre>OPENAI_API_KEY</pre></td>
      <td><a href="https://platform.openai.com/docs/models">docs</a></td>
    </tr>
    <tr>
      <td><pre>google</pre></td>
      <td><pre>GEMINI_API_KEY</pre></td>
      <td><a href="https://ai.google.dev/gemini-api/docs/models/gemini">docs</a></td>
    </tr>
    <tr>
      <td><pre>anthropic</pre></td>
      <td><pre>ANTHROPIC_API_KEY</pre></td>
      <td><a href="https://docs.anthropic.com/claude/docs/models-overview">docs</a></td>
    </tr>
    <tr>
      <td><pre>xai</pre></td>
      <td><pre>XAI_API_KEY</pre></td>
      <td><a href="https://docs.x.ai/docs">docs</a></td>
    </tr>
    <tr>
      <td><pre>deepseek</pre></td>
      <td><pre>DEEPSEEK_API_KEY</pre></td>
      <td><a href="https://api-docs.deepseek.com/">docs</a></td>
    </tr>
    <tr>
      <td><pre>ollama (local)</pre></td>
      <td>n/a</td>
      <td><a href="https://ollama.com/library">docs</a></td>
    </tr>
    <tr>
      <td><pre>qwen</pre></td>
      <td><pre>QWEN_API_KEY</pre></td>
      <td><a href="https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api">Intl.</a>/<a href="https://help.aliyun.com/zh/model-studio/getting-started/models">cn</a></td>
    </tr>
    <tr>
      <td><pre>mistral</pre></td>
      <td><pre>MISTRAL_API_KEY</pre></td>
      <td><a href="https://docs.mistral.ai/getting-started/models/models_overview/">docs</a></td>
    </tr>
    <tr>
      <td><pre>replicate</pre></td>
      <td><pre>REPLICATE_API_KEY</pre></td>
      <td><a href="https://replicate.com/collections/language-models">docs</a></td>
    </tr>
    <tr>
      <td><pre>groq (not grok)</pre></td>
      <td><pre>GROQCLOUD_API_KEY</pre></td>
      <td><a href="https://console.groq.com/docs/models">docs</a></td>
    </tr>
    <tr>
      <td><pre>huggingface</pre></td>
      <td><pre>HUGGINGFACE_API_KEY</pre></td>
      <td><a href="https://huggingface.co/models">docs</a></td>
    </tr>
    <tr>
      <td><pre>novita</pre></td>
      <td><pre>NOVITA_API_KEY</pre></td>
      <td><a href="https://novita.ai/model-api/product/llm-api?utm_source=github_mindcraft&utm_medium=github_readme&utm_campaign=link">docs</a></td>
    </tr>
    <tr>
      <td><pre>openrouter</pre></td>
      <td><pre>OPENROUTER_API_KEY</pre></td>
      <td><a href="https://openrouter.ai/models">docs</a></td>
    </tr>
    <tr>
      <td><pre>hyperbolic</pre></td>
      <td><pre>HYPERBOLIC_API_KEY</pre></td>
      <td><a href="https://docs.hyperbolic.xyz/docs/getting-started">docs</a></td>
    </tr>
    <tr>
      <td><pre>vllm</pre></td>
      <td>n/a</td>
      <td>n/a</td>
    </tr>
    <tr>
      <td><pre>cerebras</pre></td>
      <td><pre>CEREBRAS_API_KEY</pre></td>
      <td><a href="https://inference-docs.cerebras.ai/introduction">docs</a></td>
    </tr>
    <tr>
      <td><pre>mercury</pre></td>
      <td><pre>MERCURY_API_KEY</pre></td>
      <td><a href="https://www.inceptionlabs.ai/">docs</a></td>
    </tr>
    <tr>
      <td><pre>lmstudio</pre></td>
      <td>n/a</td>
      <td><a href="https://www.lmstudio.ai/">docs</a></td>
    </tr>
  </tbody>
</table>

</details>

For more comprehensive model configuration and syntax, see [Model Specifications](#model-specifications).

For local models, we recommend you use **LM Studio** for the Andy series of models. Ollama breaks current models, and should be avoided.
Please see our [huggingface page for more info.](https://huggingface.co/collections/Mindcraft-CE)

## Online Servers
To connect to online servers your bot will need an official Microsoft/Minecraft account. You can use your own personal one, but will need another account if you want to connect too and play with it. To connect, change these lines in `settings.js`:
```javascript
"host": "111.222.333.444",
"port": 55920,
"auth": "microsoft",

// rest is same...
```
> [!Important]
> The bot's name in the profile.json must exactly match the Minecraft profile name! Otherwise the bot will spam talk to itself.

To use different accounts, Mindcraft will connect with the account that the Minecraft launcher is currently using. You can switch accounts in the launcher, then run `node main.js`, then switch to your main account after the bot has connected.

## Tasks

Tasks automatically start the bot with a prompt and a goal item to acquire or blueprint to construct. To run a simple task that involves collecting 4 oak_logs run 

`node main.js --task_path tasks/basic/single_agent.json --task_id gather_oak_logs`

Here is an example task json format: 

```json
{
    "gather_oak_logs": {
      "goal": "Collect at least four logs",
      "initial_inventory": {
        "0": {
          "wooden_axe": 1
        }
      },
      "agent_count": 1,
      "target": "oak_log",
      "number_of_target": 4,
      "type": "techtree",
      "max_depth": 1,
      "depth": 0,
      "timeout": 300,
      "blocked_actions": {
        "0": [],
        "1": []
      },
      "missing_items": [],
      "requires_ctable": false
    }
}
```

The `initial_inventory` is what the bot will have at the start of the episode, `target` refers to the target item and `number_of_target` refers to the number of target items the agent needs to collect to successfully complete the task. 

If you want more optimization and automatic launching of the minecraft world, you will need to follow the instructions in [Minecollab Instructions](docs/minecollab.md#installation)

## Docker Container

If you intend to `allow_insecure_coding`, it is a good idea to run the app in a docker container to reduce risks of running unknown code. This is strongly recommended before connecting to remote servers, although still does not guarantee complete safety.

```bash
docker build -t mindcraft . && docker run --rm --add-host=host.docker.internal:host-gateway -p 8080:8080 -p 3000-3003:3000-3003 -e SETTINGS_JSON='{"auto_open_ui":false,"profiles":["./profiles/gemini.json"],"host":"host.docker.internal"}' --volume ./keys.json:/app/keys.json --name mindcraft mindcraft
```
or simply
```bash
docker-compose up --build
```

When running in docker, if you want the bot to join your local minecraft server, you have to use a special host address `host.docker.internal` to call your localhost from inside your docker container. Put this into your [settings.js](settings.js):

```javascript
"host": "host.docker.internal", // instead of "localhost", to join your local minecraft from inside the docker container
```

To connect to an unsupported minecraft version, you can try to use [viaproxy](services/viaproxy/README.md)

# Bot Profiles

Bot profiles are json files (such as `andy.json`) that define:

1. Bot backend LLMs to use for talking, coding, and embedding.
2. Prompts used to influence the bot's behavior.
3. Examples help the bot perform tasks.

## Model Specifications

LLM models can be specified simply as `"model": "gpt-5.4"`, or more specifically with `"{api}/{model}"`, like `"openrouter/google/gemini-2.5-pro"`. See all supported APIs [here](#model-customization).

The `model` field can be a string or an object. A model object must specify an `api`, and optionally a `model`, `url`, and additional `params`. You can also use different models/providers for chatting, coding, vision, embedding, and voice synthesis. See the example below.

```json
"model": {
  "api": "openai",
  "model": "gpt-5.4",
  "url": "https://api.openai.com/v1/",
  "params": {
    "max_tokens": 1000,
    "temperature": 1
  }
},
"code_model": {
  "api": "openai",
  "model": "gpt-5.4-mini",
  "url": "https://api.openai.com/v1/"
},
"vision_model": {
  "api": "openai",
  "model": "gpt-5.4",
  "url": "https://api.openai.com/v1/"
},
"embedding": {
  "api": "openai",
  "url": "https://api.openai.com/v1/",
  "model": "text-embedding-3-small"
},
"speak_model": "openai/tts-1/echo"
```

`model` is used for chat, `code_model` is used for newAction coding, `vision_model` is used for image interpretation, `embedding` is used to embed text for example selection, and `speak_model` is used for voice synthesis. `model` will be used by default for all other models if not specified. Not all APIs support embeddings, vision, or voice synthesis.

All apis have default models and urls, so those fields are optional. The `params` field is optional and can be used to specify additional parameters for the model. It accepts any key-value pairs supported by the api. Is not supported for embedding models.

## Embedding Models

Embedding models are used to embed and efficiently select relevant examples for conversation and coding.

Supported Embedding APIs: `openai`, `google`, `replicate`, `huggingface`, `novita`

If you try to use an unsupported model, then it will default to a simple word-overlap method. Expect reduced performance. We recommend using supported embedding APIs.

## Voice Synthesis Models

Voice synthesis models are used to narrate bot responses and specified with `speak_model`. This field is parsed differently than other models and only supports strings formatted as `"{api}/{model}/{voice}"`, like `"openai/tts-1/echo"`. We only support `openai` and `google` for voice synthesis.

## Specifying Profiles via Command Line

By default, the program will use the profiles specified in `settings.js`. You can specify one or more agent profiles using the `--profiles` argument: `node main.js --profiles ./profiles/andy.json ./profiles/jill.json`


# Contributing

We welcome contributions to the project! We are generally less responsive to github issues, and more responsive to pull requests. Join the [discord](https://discord.gg/mindcraft-ce) for more active support and direction.

While AI generated code is allowed, please vet it carefully. Submitting tons of sloppy code and documentation actively harms development.

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`

## Development Team
[@Sweaterdog](https://github.com/Sweaterdog) | [@riqvip](https://github.com/riqvip) | [@uukelele](https://github.com/uukelele) | [@mrelmida](https://github.com/mrelmida)


Also thanks to all the other developers of the Mindcraft project: [@MaxRobinsonTheGreat](https://github.com/MaxRobinsonTheGreat), [@kolbytn](https://github.com/kolbytn), [@icwhite](https://github.com/icwhite), [@Ninot1Quyi](https://github.com/Ninot1Quyi)



## Citation:
This work is published in the paper [Collaborating Action by Action: A Multi-agent LLM Framework for Embodied Reasoning](https://arxiv.org/abs/2504.17950). Please use this citation if you use this project in your research:
```
@article{mindcraft2025,
  title = {Collaborating Action by Action: A Multi-agent LLM Framework for Embodied Reasoning},
  author = {White*, Isadora and Nottingham*, Kolby and Maniar, Ayush and Robinson, Max and Lillemark, Hansen and Maheshwari, Mehul and Qin, Lianhui and Ammanabrolu, Prithviraj},
  journal = {arXiv preprint arXiv:2504.17950},
  year = {2025},
  url = {https://arxiv.org/abs/2504.17950},
}
```

## Contributors

Thanks to everyone who has submitted issues on and off Github, made suggestions, and generally helped make this a better project.

![Contributors](https://contrib.rocks/image?repo=mindcraft-ce/mindcraft-ce)

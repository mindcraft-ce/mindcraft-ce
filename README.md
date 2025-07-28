<h1 align="center">mindcraft-ce</h1>
<h3 align="center">
  Mindcraft Community Edition 🧠⛏️
</h3>
<h4 align="center">
  Maintained by 
  <a href="https://github.com/uukelele-scratch">@uukelele-scratch</a>, 
  <a href="https://github.com/sweaterdog">@Sweaterdog</a>, and 
  <a href="https://github.com/riqvip">@riqvip</a>
</h4>
<p align="center">
  <img alt="Static Badge" src="https://img.shields.io/badge/mindcraft-ce-badge">
  <img alt="GitHub Release Date" src="https://img.shields.io/github/release-date/mindcraft-ce/mindcraft-ce">
  <img alt="GitHub commits since latest release" src="https://img.shields.io/github/commits-since/mindcraft-ce/mindcraft-ce/latest">
  <!--
    uh we can make this visible when there are more downloads
    <img alt="GitHub Downloads (all assets, all releases)" src="https://img.shields.io/github/downloads/mindcraft-ce/mindcraft-ce/total">
  -->
  <img alt="GitHub repo size" src="https://img.shields.io/github/repo-size/mindcraft-ce/mindcraft-ce">


</p>

<p align="center">
  Crafting minds for Minecraft with LLMs and <a href="https://prismarinejs.github.io/mineflayer/#/">mineflayer</a>!
</p>

<p align="center">
  <a href="/FAQ.md">FAQ</a> |
  <a href="https://discord.gg/DNnBQvCtwr">Discord Support</a> |
  <a href="https://kolbynottingham.com/mindcraft/">Blog Post</a> |
  <a href="https://mindcraft-minecollab.github.io/index.html">Paper Website</a> |
  <a href="/minecollab.md">MineCollab</a>
</p>

> [!Note]
> This fork of Mindcraft is maintained by the community and includes features not present in [the official repo](https://github.com/kolbytn/mindcraft).

### mindcraft vs. mindcraft-ce

| Feature | mindcraft (Original) | mindcraft-ce (Community Edition) |
| --- | --- | --- |
| **Development Status** | Inactive | **Active** |
| **Minecraft Version** | Up to 1.21.1 | Up to **1.21.4** |
| **Node.js Version** | v14+ | **v18+** (v22 recommended) |
| **Default Ollama Model**| `llama3.1` (Generic) | **`Andy-4`** (Built for Minecraft) |
| **Free API Option** | No | **Yes** (`pollinations`) |
| **Voice Interaction** | Basic Text-to-Speech (TTS) | Advanced TTS & **Speech-to-Text (STT)** |
| **Vision Mode** | Simple on/off toggle | **Modes**: `off`, `prompted`, `always` |
| **Extensibility** | None | **Plugin System** |
| **Dataset Tools** | No | **Yes**, built-in tools for data collection |
| **Dependencies** | Older | **Updated** (e.g., Mineflayer 4.29.0) |
| **Error Handling** | Shows technical error message, difficult to troubleshoot | **Includes suggested fix** for easy fixing |
| **Pathfinding** | Basic, standard robotic movement. | **Upgraded movements**, ability to use doors, fence gates, and swim better.|

> [!Caution]
> Do not connect this bot to public servers with coding enabled. This project allows an LLM to write/execute code on your computer. The code is sandboxed, but still vulnerable to injection attacks. Code writing is disabled by default. You can enable it by setting <code>allow_insecure_coding</code> to <code>true</code> in <code>settings.js</code>. Ye be warned.

## Requirements

- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc) (up to v1.21.4)
- [node.js](https://nodejs.org/) (at least v18)
- [git](https://git-scm.com/downloads/)
  <details>
    <summary>One of these (optional, you can also use pollinations.ai without any key):</summary>
    <ul>
      <li><a href="https://openai.com/blog/openai-api">OpenAI API Key</a></li>
      <li><a href="https://aistudio.google.com/app/apikey">Gemini API Key</a></li>
      <li><a href="https://docs.anthropic.com/claude/docs/getting-access-to-claude">Anthropic API Key</a></li>
      <li><a href="https://replicate.com/">Replicate API Key</a></li>
      <li><a href="https://huggingface.co/">Hugging Face API Key</a></li>
      <li><a href="https://console.groq.com/keys">Groq API Key</a></li>
      <li><a href="https://ollama.com/download">Ollama Installed</a></li>
      <li><a href="https://docs.mistral.ai/getting-started/models/models_overview/">Mistral API Key</a></li>
      <li><a href="https://www.alibabacloud.com/help/en/model-studio/developer-reference/get-api-key">Qwen API Key [Intl.]</a> / <a href="https://help.aliyun.com/zh/model-studio/getting-started/first-api-call-to-qwen?">[cn]</a></li>
      <li><a href="https://www.volcengine.com/docs/82379/1099455">Doubao API Key [Intl.]</a> / <a href="https://www.volcengine.com/docs/82379/1399008">[cn]</a></li>
      <li><a href="https://novita.ai/settings?utm_source=github_mindcraft&utm_medium=github_readme&utm_campaign=link#key-management">Novita AI API Key</a></li>
    </ul>
  </details>


## Install and Run

> [!Note]
> An experimental Windows-only single-click installer + launcher, with extra features like a GUI editor for changing settings, is being worked on.
> Additionally, there is also another single-click installer + launcher available [here](https://github.com/freeload101/MSC_MINDcraft_Single_Click). The single click installer auto-configures everything for you, and uses the optimal Andy-4 model based on your setup.

1. Make sure you have the requirements above. <!-- Removed since `Mic` is the default for STT now, just added naudiodon in case Mic bugs out, since it has before.If you plan to use the STT (Speech-to-Text) feature, also review the "Installation Prerequisites" section regarding `naudiodon`. -->

2. Download this repository's [latest release](https://github.com/mindcraft-ce/mindcraft-ce/releases/latest). Unzip it to your Downloads folder.

> [!Note]
> We recommend using pollinations.ai as it is the easiest to set up. <!-- I would recommend Andy-4 personally 😒 -->
> If you're using it, you can skip step 3 below.

3. Rename `keys.example.json` to `keys.json` and fill in your API keys (you only need one). The desired model is set in `andy.json` or other profiles. For other models refer to the table below.

4. In terminal/command prompt, run `npm install` from the installed directory. (Note: If `naudiodon` fails to build and you don't need STT, you can usually proceed.)

5. Start a minecraft world and open it to LAN on localhost port `55916`

6. Run `node main.js` from the installed directory

If you encounter issues, check the [FAQ](/FAQ.md) or find support on [discord](https://discord.gg/DNnBQvCtwr). If that fails, you can [create an issue](https://github.com/mindcraft-ce/mindcraft-ce/issues/new).

## Model Customization

You can configure project details in `settings.js`. [See file.](settings.js)

You can configure the agent's name, model, and prompts in their profile like `andy.json` with the `model` field. For comprehensive details, see [Model Specifications](#model-specifications).

| API | Config Variable | Example Model name | Docs |
|------|------|------|------|
| `openai` | `OPENAI_API_KEY` | `gpt-4.1-mini` | [docs](https://platform.openai.com/docs/models) |
| `google` | `GEMINI_API_KEY` | `gemini-2.0-flash` | [docs](https://ai.google.dev/gemini-api/docs/models/gemini) |
| `vertex` | `GCLOUD AUTHENTICATION` | `vertex/gemini-2.0-flash` | [models](https://console.cloud.google.com/vertex-ai/model-garden) [docs](src/models/vertex_ai.md) |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-3-5-haiku-20241022` | [docs](https://docs.anthropic.com/claude/docs/models-overview) |
| `xai` | `XAI_API_KEY` | `grok-3-mini` | [docs](https://docs.x.ai/docs) |
| `deepseek` | `DEEPSEEK_API_KEY` | `deepseek-chat` | [docs](https://api-docs.deepseek.com/) |
| `ollama` (local) | n/a | `ollama/sweaterdog/andy-4` | [docs](https://ollama.com/library) |
| `qwen` | `QWEN_API_KEY` | `qwen-max` | [Intl.](https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api)/[cn](https://help.aliyun.com/zh/model-studio/getting-started/models) |
| `doubao` | `DOUBAO_API_KEY` | `doubao-1-5-pro-32k-250115` | [cn](https://www.volcengine.com/docs/82379/1330310) |
| `mistral` | `MISTRAL_API_KEY` | `mistral-large-latest` | [docs](https://docs.mistral.ai/getting-started/models/models_overview/) |
| `replicate` | `REPLICATE_API_KEY` | `replicate/meta/meta-llama-3-70b-instruct` | [docs](https://replicate.com/collections/language-models) |
| `groq` (not grok) | `GROQCLOUD_API_KEY` | `groq/mixtral-8x7b-32768` | [docs](https://console.groq.com/docs/models) |
| `huggingface` | `HUGGINGFACE_API_KEY` | `huggingface/mistralai/Mistral-Nemo-Instruct-2407` | [docs](https://huggingface.co/models) |
| `novita` | `NOVITA_API_KEY` | `novita/deepseek/deepseek-r1` | [docs](https://novita.ai/model-api/product/llm-api?utm_source=github_mindcraft&utm_medium=github_readme&utm_campaign=link) |
| `openrouter` | `OPENROUTER_API_KEY` | `openrouter/anthropic/claude-sonnet-4` | [docs](https://openrouter.ai/models) |
| `glhf.chat` | `GHLF_API_KEY` | `glhf/hf:meta-llama/Llama-3.1-405B-Instruct` | [docs](https://glhf.chat/user-settings/api) |
| `hyperbolic` | `HYPERBOLIC_API_KEY` | `hyperbolic/deepseek-ai/DeepSeek-V3` | [docs](https://docs.hyperbolic.xyz/docs/getting-started) |
| `pollinations` | n/a | `pollinations/openai-large` | [docs](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md) |
| `andy API` | `ANDY_API_KEY` (optional) | `andy/sweaterdog/andy-4` | [docs](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md) |
| `vllm` | n/a | `vllm/llama3` | n/a |

If you use Ollama, to install the models used by default (generation and embedding), execute the following terminal command:
`ollama pull sweaterdog/andy-4 && ollama pull nomic-embed-text`
<details>
  <summary>Additional info about Andy-4...</summary>
  
  ![image](https://github.com/user-attachments/assets/215afd01-3671-4bb6-b53f-4e51e710239a)


  Andy-4 is a community made, open-source model made by Sweaterdog to play Minecraft.
  Since Andy-4 is open-source, which means you can download the model, and play with it offline and for free.

  The Andy-4 collection of models has reasoning and non-reasoning modes, sometimes the model will reason automatically without being prompted.
  If you want to specifically enable reasoning, use the `andy-4-reasoning.json` profile.
  Some Andy-4 models may not be able to disable reasoning, no matter what profile is used.

  Andy-4 has many different models, and come in different sizes.
  For more information about which model size is best for you, check [Sweaterdog's Ollama page](https://ollama.com/Sweaterdog/Andy-4)

  If you have any Issues, join the Mindcraft server, and ping `@Sweaterdog` with your issue, or leave an issue on the [Andy-4 huggingface repo](https://huggingface.co/Sweaterdog/Andy-4/discussions/new)
</details>

## Bot Profiles

Bot profiles are json files (such as `andy.json`) that define:

1. Bot backend LLMs to use for talking, coding, and embedding.
2. Prompts used to influence the bot's behavior.
3. Examples help the bot perform tasks.

## Model Specifications

LLM models can be specified simply as `"model": "gpt-4o"`. However, you can use different models for chat, coding, and embeddings. 
You can pass a string or an object for these fields. A model object must specify an `api`, and optionally a `model`, `url`, and additional `params`.

```json
"model": {
  "api": "openai",
  "model": "gpt-4.1",
  "url": "https://api.openai.com/v1/",
  "params": {
    "max_tokens": 1000,
    "temperature": 1
  }
},
"code_model": {
  "api": "openai",
  "model": "o4-mini",
  "url": "https://api.openai.com/v1/"
},
"vision_model": {
  "api": "openai",
  "model": "gpt-4.1",
  "url": "https://api.openai.com/v1/"
},
"embedding": {
  "api": "openai",
  "url": "https://api.openai.com/v1/",
  "model": "text-embedding-3-large"
},
"speak_model": {
  "api": "pollinations",
  "url": "https://text.pollinations.ai/openai",
  "model": "openai-audio",
  "voice": "echo"
}

```

`model` is used for chat, `code_model` is used for newAction coding, `vision_model` is used for image interpretation, and `embedding` is used to embed text for example selection. If `code_model` or `vision_model` is not specified, `model` will be used by default. Not all APIs support embeddings or vision.

All apis have default models and urls, so those fields are optional. The `params` field is optional and can be used to specify additional parameters for the model. It accepts any key-value pairs supported by the api. Is not supported for embedding models.

## Embedding Models

Embedding models are used to embed and efficiently select relevant examples for conversation and coding.

Supported Embedding APIs: `openai`, `google`, `replicate`, `huggingface`, `novita`, `ollama`, `andy`

If you try to use an unsupported model, then it will default to a simple word-overlap method. Expect reduced performance, recommend mixing APIs to ensure embedding support.


## Plugins

mindcraft-ce has support for custom plugins! For instructions, check out [the plugin documentation](/src/plugins/README.md).

## Online Servers
To connect to online servers your bot will need an official Microsoft/Minecraft account. You can use your own personal one, but will need another account if you want to connect too and play with it. To connect, change these lines in `settings.js`:
```javascript
"host": "111.222.333.444",
"port": 25565,
"auth": "microsoft",

// rest is same...
```
> [!Important]
> The bot's name in the profile.json must exactly match the Minecraft profile name! Otherwise the bot will spam talk to itself.
> Example: If you are signing in with a Microsoft account, with the username "Player01", then you need to set the name in profile to "Player01".

When using a Microsoft account for mindcraft, it will show a link and a code. Open the link in the browser, sign in with the Microsoft account you wish for the bot to use, and follow the on-screen instructions.

## Migrating PRs from the Original Repo

>[!warning]
> These steps only work if you have write access to mindcraft-ce.

1. **Clone the fork** with the PR (e.g. `mindcraft-fork`), if you haven't already.
2. Add `mindcraft-ce` as a remote:

```bash
git remote add mindcraft-ce https://github.com/mindcraft-ce/mindcraft-ce.git
```

3. Push the branch to `mindcraft-ce`, replacing `patch-x` with your branch's name:
```bash
git push mindcraft-ce patch-x
```

4. On GitHub, go to `mindcraft-ce`, switch to `patch-x`, and create a PR to the desired branch in `mindcraft-ce`.

## Docker Container

If you intend to `allow_insecure_coding`, it is a good idea to run the app in a docker container to reduce risks of running unknown code. This is strongly recommended before connecting to remote servers.

```bash
docker run -i -t --rm -v $(pwd):/app -w /app -p 3000-3003:3000-3003 node:latest node main.js
```
or simply
```bash
docker-compose up
```

When running in docker, if you want the bot to join your local minecraft server, you have to use a special host address `host.docker.internal` to call your localhost from inside your docker container. Put this into your [settings.js](settings.js):

```javascript
"host": "host.docker.internal", // instead of "localhost", to join your local minecraft from inside the docker container
```

To connect to an unsupported minecraft version, you can try to use [viaproxy](services/viaproxy/README.md)

## STT in Mindcraft

STT allows you to speak to the model if you have a microphone.

STT can be enabled in `settings.js` under the section that looks like this:
```javascript
    "stt_transcription": true, // Change this to "true" to enable STT
    "stt_provider": "groq", // STT provider: "groq" or "pollinations"
    "stt_username": "SYSTEM",
    "stt_agent_name": ""
```

The Text to Speech engine will begin listening on the system default input device.

If for some reason STT does not work, install naudiodon by running the command: `npm install naudiodon`

**STT Providers:**
- **Groq**: You **need** a [GroqCloud API key](https://console.groq.com/keys) as Groq is used for Audio transcription
- **Pollinations**: Free STT service, no API key required. Uses the `openai-audio` model via the Pollinations API. <!-- Why do we recommend this? I mean it is a TTS model, not a STT model... -->

To use Groq STT, simply set `"stt_provider": "groq"` in your settings.js file. This provides an alternative to pollinations for speech-to-text transcription.
> [!Note]
> Pollinations can be buggy!
> Using STT as `groq` is still free, and is far more stable and correct that pollinations.
<!-- UPDATED BECAUSE POLLINATIONS IS NOW DEFAULT -->

## Dataset collection

Mindcraft has the capabilities to collect data from you playing with the bots, which can be used to generate training data to fine-tune models such as Andy-4. To do this, enable logging inside of `settings.js`, then navigate to the `logs` folder.

Inside of the logs folder, and installing the dependecies, you will find a file named `generate_usernames.py`, you need to run this in order to convert your collected data into a usable dataset. This will generate a bunch of random names to replace the name of your bot, and your username. Both of which improve performance later on.

To run it, run `python generate_usernames.py`. The max amount of usernames will take up multiple Terabytes of data. If for some reason you want to do this, run it with the `--make_all` flag.

Next, you need to set up `convert.py` to include every username that interacted with the bot, as well as the bot's own username. This is done by adding / changing the usernames in the `ORIGINAL_USERNAMES` list.

After this, you are all set up for conversion! Since you might not want to convert all data at once, you must change the names of the `.csv` file*(s)* that you want to convert to `Andy_pre1`. If more than one file is wanted for conversion, change `1` to the next number, this value can be as high as you want.

To convert, run `python convert.py`, if you get a dependency error, ensure you are in a virtual python environment rather than a global one.

For setting up vision datasets, run `convert.py` with the flag of `--vision`, this will do the same thing as the rest of the conversions, but change the format to an image-friendly way. But it should be known that the formatted image data is **not yet prepared** for training, we are still working out how to have the data effectively be used by Unsloth.

## Tasks

Bot performance can be roughly evaluated with Tasks. Tasks automatically intialize bots with a goal to aquire specific items or construct predefined buildings, and remove the bot once the goal is achieved.

To run tasks, you need python, pip, and optionally conda. You can then install dependencies with `pip install -r requirements.txt`. 

Tasks are defined in json files in the `tasks` folder, and can be run with: `python tasks/run_task_file.py --task_path=tasks/example_tasks.json`

For full evaluations, you will need to [download and install the task suite. Full instructions.](minecollab.md#installation)

## Specifying Profiles via Command Line

By default, the program will use the profiles specified in `settings.js`. You can specify one or more agent profiles using the `--profiles` argument: `node main.js --profiles ./profiles/andy.json ./profiles/jill.json`

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`

## Citation:

```
@article{mindcraft2025,
  title = {Collaborating Action by Action: A Multi-agent LLM Framework for Embodied Reasoning},
  author = {White*, Isadora and Nottingham*, Kolby and Maniar, Ayush and Robinson, Max and Lillemark, Hansen and Maheshwari, Mehul and Qin, Lianhui and Ammanabrolu, Prithviraj},
  journal = {arXiv preprint arXiv:2504.17950},
  year = {2025},
  url = {https://arxiv.org/abs/2504.17950},
}
```

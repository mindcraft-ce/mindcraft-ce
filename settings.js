import path from 'path';
import fs from 'fs';
const settings = {
  "minecraft_version": "1.21.6", // supports up to 1.21.6
  "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
  "port": 55916,
  "auth": "offline", // or "microsoft"

  // the mindserver manages all agents and hosts the UI
  "host_mindserver": true, // if true, the mindserver will be hosted on this machine. otherwise, specify a public IP address
  "mindserver_host": "localhost",
  "mindserver_port": 8080,

  // the base profile is shared by all bots for default prompts/examples/modes
  "base_profile": "./profiles/defaults/_default.json", // also see creative.json, god_mode.json, and personality.json is really fun.
  "profiles": [
    "./andy.json",
    // "./profiles/gpt.json",
    // "./profiles/claude.json",
    // "./profiles/gemini.json",
    // "./profiles/llama.json",
    // "./profiles/qwen.json",
    // "./profiles/grok.json",
    // "./profiles/mistral.json",
    // "./profiles/deepseek.json",
    // "./profiles/vertex.json",
    // "./profiles/andy-4.json",

    // using more than 1 profile requires you to /msg each bot indivually
    // individual profiles override values from the base profile
  ],
  "plugins": [], // you can add plugins here, e.g. pre-installed plugin: "Dance"
  "load_memory": false, // load memory from previous session
  "init_message": "Respond with hello world and your name", // sends to all on spawn
  "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly

  "language": "en", // translate to/from this language. NOT text-to-speech language. Supports these language names: https://cloud.google.com/translate/docs/languages
  "show_bot_views": false, // show bot's view in browser at localhost:3000, 3001...

  "allow_insecure_coding": false, // allows newAction command and model can write/run code on your computer. enable at own risk
  "allow_vision": false, // allows vision model to interpret screenshots as inputs
  "vision_mode": "prompted", // "off", "prompted", or "always"
  "blocked_actions": ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"], // commands to disable and remove from docs. Ex: ["!setMode"]
  "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
  "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all

  "max_messages": 15, // max number of messages to keep in context
  "num_examples": 2, // number of examples to give to the model
  "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
  "verbose_commands": true, // show full command syntax
  "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
  "chat_bot_messages": true, // publicly chat messages to other bots

  "auto_idle_trigger": {
    "enabled": false,
    "timeout_secs": 120, // 10 seconds inactivity before prompting
    "message": "Keep doing stuff!"
  },

  "speak": true,
  // allows all bots to speak through text-to-speech. format: {provider}/{model}/{voice}. if set to "system" it will use system text-to-speech, which works on windows and mac, but on linux you need to `apt install espeak`.
  // specify speech model inside each profile - so that you can have each bot with different voices ;)

  "stt_transcription": false, // enable speech-to-text transcription
  "stt_provider": "pollinations", // STT provider: "groq" (requires API key) or "pollinations" (free)
  "stt_username": "SERVER", // username for STT messages
  "stt_agent_name": "", // agent name for STT messages, if empty it will send the STT to all bots

  // STT Audio Detection Settings
  "stt_rms_threshold": 3000,       // Raised from 1000 to reduce false triggers
  "stt_silence_duration": 2000,   // 2 seconds of silence before stopping
  "stt_min_audio_duration": 0.5,  // Minimum audio duration in seconds
  "stt_max_audio_duration": 45,   // Maximum audio duration in seconds
  "stt_debug_audio": true,        // Enable to see what's happening
  "stt_cooldown_ms": 2000,        // Minimum time between recordings
  "stt_speech_threshold_ratio": 0.05, // Much lower - 5% instead of 15%
  "stt_consecutive_speech_samples": 3, // Reduced from 5 to 3

  "log_normal_data": false, // Logs all inputs / outputs without reasoning or vision data
  "log_reasoning_data": false, // Logs only reasoning inputs / outputs
  "log_vision_data": false, // Logs only vision inputs / outputs

}

// these environment variables override certain settings
if (process.env.SETTINGS_PATH) {
  try {
    const cfgPath = path.resolve(process.env.SETTINGS_PATH);
    if (fs.existsSync(cfgPath)) {
      const raw = fs.readFileSync(cfgPath, 'utf-8');
      const overrides = JSON.parse(raw);
      Object.assign(settings, overrides);
      console.log(`Loaded overrides from ${cfgPath}`);
    } else {
      console.warn(`SETTINGS_PATH file not found: ${cfgPath}`);
    }
  } catch (err) {
    console.error("Failed to load SETTINGS_PATH overrides:", err);
  }
}
if (process.env.MINECRAFT_VERSION) {
  settings.minecraft_version = process.env.MINECRAFT_VERSION;
}
if (process.env.HOST) {
  settings.host = process.env.HOST;
}
if (process.env.PORT) {
  settings.port = parseInt(process.env.PORT, 10);
}
if (process.env.MINECRAFT_PORT) {
  settings.port = parseInt(process.env.MINECRAFT_PORT, 10);
}
if (process.env.AUTH) {
  settings.auth = process.env.AUTH;
}
if (process.env.MINDSERVER_PORT) {
  settings.mindserver_port = parseInt(process.env.MINDSERVER_PORT, 10);
}
if (process.env.PROFILES) {
  try {
    const profiles = JSON.parse(process.env.PROFILES);
    if (Array.isArray(profiles) && profiles.length > 0) {
      settings.profiles = profiles;
    }
  } catch (e) {
    console.error("Failed to parse PROFILES env var:", e);
  }
}
if (process.env.LOAD_MEMORY) {
  settings.load_memory = JSON.parse(process.env.LOAD_MEMORY);
}
if (process.env.ONLY_CHAT_WITH) {
  try {
    settings.only_chat_with = JSON.parse(process.env.ONLY_CHAT_WITH);
  } catch (e) {
    console.error("Failed to parse ONLY_CHAT_WITH env var:", e);
  }
}
if (process.env.LANGUAGE) {
  settings.language = process.env.LANGUAGE;
}
if (process.env.SHOW_BOT_VIEWS) {
  settings.show_bot_views = JSON.parse(process.env.SHOW_BOT_VIEWS);
}
if (process.env.ALLOW_INSECURE_CODING || process.env.INSECURE_CODING) {
  settings.allow_insecure_coding = true;
}
if (process.env.ALLOW_VISION) {
  settings.allow_vision = JSON.parse(process.env.ALLOW_VISION);
}
if (process.env.VISION_MODE) {
  settings.vision_mode = process.env.VISION_MODE;
}
if (process.env.BLOCKED_ACTIONS) {
  try {
    settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
  } catch (e) {
    console.error("Failed to parse BLOCKED_ACTIONS env var:", e);
  }
}
if (process.env.MAX_MESSAGES) {
  settings.max_messages = parseInt(process.env.MAX_MESSAGES, 10);
}
if (process.env.NUM_EXAMPLES) {
  settings.num_examples = parseInt(process.env.NUM_EXAMPLES, 10);
}

export default settings;

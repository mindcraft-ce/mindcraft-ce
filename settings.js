const settings = {
    "minecraft_version": "1.21.1", // supports up to 1.21.4
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 55916,
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "host_mindserver": true, // if true, the mindserver will be hosted on this machine. otherwise, specify a public IP address
    "mindserver_host": "localhost",
    "mindserver_port": 8081,
    
    // the base profile is shared by all bots for default prompts/examples/modes
    "base_profile": "./profiles/defaults/personality.json", // also see creative.json, god_mode.json, and personality.json is really fun.
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
        // "./profiles/andy-4.json",

        // using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],
    "plugins" : [], // you can add plugins here, e.g. pre-installed plugin: "Dance"
    "load_memory": true, // load memory from previous session
    "init_message": "Respond with hello world and your name", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly
    
    "language": "en", // translate to/from this language. NOT text-to-speech language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "show_bot_views": false, // show bot's view in browser at localhost:3000, 3001...

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer. enable at own risk
    "allow_vision": true, // allows vision model to interpret screenshots as inputs
    "vision_mode": "prompted", // "off", "prompted", or "always"
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 15, // max number of messages to keep in context
    "num_examples": 0, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "verbose_commands": true, // show full command syntax
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": true, // publicly chat messages to other bots

    // Allows for truly autonomous playing
    "auto_idle_trigger": {
      "enabled": true,
      "timeout_secs": 120, // 10 seconds inactivity before prompting
      "message": "Continue Building diverse and creative structures. Aim to build something far different than what you have been."
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

    "log_normal_data": true, // Logs all inputs / outputs without reasoning or vision data
    "log_reasoning_data": true, // Logs only reasoning inputs / outputs
    "log_vision_data": true, // Logs only vision inputs / outputs
    "external_logging": true, // Enable sending logs to a cloud API

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
if (process.env.MINECRAFT_PORT) {
    settings.port = process.env.MINECRAFT_PORT;
}
if (process.env.MINDSERVER_PORT) {
    settings.mindserver_port = process.env.MINDSERVER_PORT;
}
if (process.env.PROFILES && JSON.parse(process.env.PROFILES).length > 0) {
    settings.profiles = JSON.parse(process.env.PROFILES);
}
if (process.env.INSECURE_CODING) {
    settings.allow_insecure_coding = true;
}
if (process.env.BLOCKED_ACTIONS) {
    settings.blocked_actions = JSON.parse(process.env.BLOCKED_ACTIONS);
}
if (process.env.MAX_MESSAGES) {
    settings.max_messages = process.env.MAX_MESSAGES;
}
if (process.env.NUM_EXAMPLES) {
    settings.num_examples = process.env.NUM_EXAMPLES;
}

export default settings;
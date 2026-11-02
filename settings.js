const settings = {
    "minecraft_version": "1.21.6", // or specific version like "1.21.6"
    "host": "localhost", // or "localhost", "your.ip.address.here"
    "port": 55916, // set to -1 to automatically scan for open ports
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    "auto_open_ui": false, // opens UI in browser on startup
    
    "base_profile": "assistant", // survival, assistant, creative, or god_mode
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
        // "./profiles/mercury.json",
        // "./profiles/andy-4.2.json",

        // using more than 1 profile requires you to /msg each bot indivually
        // individual profiles override values from the base profile
    ],

    // Individual bot profiles override these defaults. Restart the app after changing settings.
    // Native tools let the model mine, craft and build through predefined actions.
    // Set false for the legacy !command response format; player-entered !commands still work.
    "use_function_calling": true,

    // Brain mode adds planning, goal tracking and supervision around the Task executor.
    // It still controls one Minecraft bot, but can make more AI requests. Requires native tools.
    // RP optionally rewrites Brain replies in character; it does not control actions/narration.
    "use_brain_agent": false,
    "use_rp_agent": true,

    // Optional fixed models for Brain/Task/RP. Empty uses the profile's main "model".
    // These role overrides apply in Brain mode; the normal single-agent loop uses "model".
    "brain_model": "",
    "task_model": "",
    "rp_model": "",

    // Prompt formatting only: auto already selects XML templates for native tools.
    // "xml" also selects XML for legacy commands. Custom profile prompts take precedence.
    "prompt_format": "auto",

    // Progress updates: "all" = every tool, "periodic" = cadence below, "none" = no routine chatter.
    // Answers, questions, completion and important blockers remain visible in every mode.
    // Both cadence values apply ONLY to periodic mode: N completed tools OR T seconds of silence.
    "tool_narration": "periodic",
    "tool_narration_every": 3,
    "tool_narration_max_silence_seconds": 30,

    // Brain checks active work at this interval; it does not poll when idle. 0 disables timed checks.
    "brain_check_in_seconds": 60,
    // Maximum wait for a native model response before the request is stopped.
    "request_timeout_seconds": 120,

    // Brain can choose a Task model from your configured list for each assigned task.
    // Requires Brain mode. This is separate from the decision service below.
    // Entries: {"id":"worker", "model":"ollama/your-model", "notes":"Routine gathering"}
    // Optional scores are your hints about capabilities, not measured benchmarks.
    // default_task_model is an entry ID used when Brain makes no selection; empty uses task_model.
    "model_selection": {
        "enabled": false,
        "default_task_model": "",
        "models": []
    },

    // Optional separate AI classifier for narrow questions, not a second planner.
    // With Brain OFF: only classifies player chat (addressed to bot? stop request?).
    // MindServer ADMIN messages bypass that filter, so UI-only use gets little benefit.
    // With Brain ON: also helps check task progress and goals, and can skip routine Brain checks.
    // Requires access/key for a supported decision endpoint; ordinary chat models are not substitutes.
    // Missing keys, errors or uncertain answers fall back to normal behavior. Plain "stop" needs no AI.
    "decisions": {
        "enabled": false,
        "provider": "openrouter", // typesafe, openrouter or openai; uses that provider's key
        "model": "", // empty uses the adapter's default decision model
        "timeout_ms": 4000, // give up and fall back after this wait
        "min_confidence": 0.6, // minimum confidence to accept a category such as done/blocked
        "min_probability": 0.85, // minimum probability to accept a yes/no judgment
        "chat_triage": true, // decide whether player chat is for the bot and recognize intent
        "task_status": true, // done/blocked/continue checks; used with Brain mode
        "goal_check": true // evidence-based goal checks; used with Brain mode
    },

    // Shared usage limits across model roles and decisions. null means no limit.
    // Daily/hourly usage survives restart; session usage resets. In-flight requests can cross a cap.
    // If a configured limit cannot be measured, further requests pause rather than assuming zero usage.
    "usage_budget": {
        "usd_per_session": null,
        "usd_per_day": null,
        "tokens_per_hour": null
    },
    // Optional USD rates when the provider reports tokens but no cost:
    // {"input_per_million":1, "output_per_million":2, "cached_input_per_million":0.5}
    // Use your model's actual rates; roster entries and decisions can have separate pricing.
    "model_pricing": null,

    // Bounds for one native conversation/task loop, preventing endless attempts.
    "agent_max_steps": 50, // model turns
    "agent_max_tool_calls": 80,
    "max_tool_calls_per_response": 12,
    "log_level": "info",
    "log_module_levels": {},

    // Memory is saved automatically. true restores it on startup; false starts a fresh conversation.
    "load_memory": false,
    "init_message": "Respond with hello world and your name", // sends to all on spawn
    "only_chat_with": [], // users that the bots listen to and send general messages to. if empty it will chat publicly

    "speak": false,
    // allows all bots to speak through text-to-speech. 
    // specify speech model inside each profile with format: {provider}/{model}/{voice}.
    // if set to "system" it will use basic system text-to-speech. 
    // Works on windows and mac, but linux requires you to install the espeak package through your package manager eg: `apt install espeak` `pacman -S espeak`.

    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en", // translate to/from this language. Supports these language names: https://cloud.google.com/translate/docs/languages
    "render_bot_view": false, // show bot's view in browser at localhost:3000, 3001...

    // Allows generated executable code (newAction/executeCode/augments) with host access.
    // Ordinary mining, crafting and building tools work while this is false.
    "allow_insecure_coding": false,
    "allow_vision": false, // allows vision model to interpret screenshots as inputs
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"] , // commands to disable and remove from docs. Ex: ["!setMode"]
    "code_timeout_mins": -1, // minutes code is allowed to run. -1 for no timeout
    "relevant_docs_count": 5, // number of relevant code function docs to select for prompting. -1 for all

    "max_messages": 15, // max number of messages to keep in context
    "num_examples": 2, // number of examples to give to the model
    "max_commands": -1, // max number of commands that can be used in consecutive responses. -1 for no limit
    "show_command_syntax": "full", // "full", "shortened", or "none"
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')
    "chat_bot_messages": true, // publicly chat messages to other bots

    "spawn_timeout": 30, // num seconds allowed for the bot to spawn before throwing error. Increase when spawning takes a while.
    "block_place_delay": 0, // delay between placing blocks (ms) if using newAction. helps avoid bot being kicked by anti-cheat mechanisms on servers.
  
    "log_all_prompts": false, // log ALL prompts to file
};

export default settings;

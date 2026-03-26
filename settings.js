const settings = {
    "minecraft_version": "1.21.11", // server 1.21.10 uses same protocol 774 as 1.21.11
    "host": "localhost",
    "port": 25565,
    "auth": "microsoft",

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    "auto_open_ui": true, // opens UI in browser on startup

    "base_profile": "builder", // survival, assistant, builder, creative, or god_mode
    "profiles": [
        // "./andy.json",
        // "./profiles/gpt.json",
        // "./profiles/claude.json",
        // "./profiles/gemini.json",
        // "./profiles/llama.json",
        // "./profiles/qwen.json",
        // "./profiles/grok.json",
        // "./profiles/mistral.json",
        // "./profiles/deepseek.json",
        // "./profiles/mercury.json",
        // "./profiles/andy-4.json", // Supports up to 75 messages!

        // using more than 1 profile requires you to /msg each bot individually
        // individual profiles override values from the base profile
    ],

    "load_memory": true, // load memory from previous session
    "init_message": "Hello world! I am ready.", // sends to all on spawn
    "only_chat_with": [],
    "bot_nicknames": [], // server nicknames for the bot — messages from these are ignored as self-chat
    "chat_mode": "whisper", // "public", "whisper" (uses only_chat_with), or "staffchat" (sends via /sc command)
    "staffchat_command": "/sc", // the server command for staff chat

    "speak": false,
    "chat_ingame": true, // bot responses are shown in minecraft chat
    "language": "en",
    "render_bot_view": false,

    "allow_insecure_coding": true, // allows newAction command and model can write/run code on your computer
    "allow_vision": false,
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"],
    "code_timeout_mins": -1,
    "relevant_docs_count": 5,

    "max_messages": 500,
    "num_examples": 2,
    "max_commands": -1,
    "show_command_syntax": "none", // "full", "shortened", or "none" — none = only chat conversationally, commands go to log only
    "narrate_behavior": false,
    "chat_bot_messages": false, // no other bots on server

    "spawn_timeout": 120,
    "block_place_delay": 0,
    "log_all_prompts": false,

    // --- SERVER CUSTOMIZATION ---
    // Path to a customization module that extends ServerCustomization.
    // Set to "" or remove to use defaults (no server-specific behavior).
    // See src/customization/base.js for the hook interface.
    "customization": "",
}


export default settings;

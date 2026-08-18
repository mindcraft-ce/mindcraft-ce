const settings = {
    "minecraft_version": "auto", // or specific version like "1.21.11"
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 55916, // set to -1 to automatically scan for open ports
    "auth": "offline", // or "microsoft"

    // the mindserver manages all agents and hosts the UI
    "mindserver_port": 8080,
    "auto_open_ui": true, // opens UI in browser on startup
    
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
    ],

    "load_memory": false,
    "init_message": "Respond with hello world and your name",
    "only_chat_with": [],
    "allow_public_commands": false,
    "command_users": [],
    "command_acl": {},
    "allow_offline_command_acl": false, // DANGEROUS: trusts spoofable usernames when auth="offline"

    "speak": false,
    "chat_ingame": true,
    "language": "en",
    "render_bot_view": false,

    "allow_insecure_coding": false,
    "allow_vision": false,
    "blocked_actions" : ["!checkBlueprint", "!checkBlueprintLevel", "!getBlueprint", "!getBlueprintLevel"],
    "code_timeout_mins": -1,
    "relevant_docs_count": 5,

    "max_messages": 15,
    "num_examples": 2,
    "max_commands": -1,
    "show_command_syntax": "full",
    "narrate_behavior": true,
    "chat_bot_messages": true,

    "spawn_timeout": 30,
    "block_place_delay": 0,
    "log_all_prompts": false,
};

export default settings;

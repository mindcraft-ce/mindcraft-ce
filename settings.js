const settings = {
    "minecraft_version": "1.21.6",
    "host": "127.0.0.1",
    "port": 25565,
    "auth": "offline",

    "mindserver_port": 8080,
    "auto_open_ui": false,

    "base_profile": "assistant",
    "profiles": [
        "./profiles/dogday.json",
        "./profiles/catnap.json",
        "./profiles/bubba.json",
        "./profiles/bobby.json",
        "./profiles/hoppy.json",
        "./profiles/kickin.json",
        "./profiles/crafty.json",
        "./profiles/picky.json",
    ],

    "load_memory": false,
    "init_message": "Just spawned in. Greet briefly in your character voice, and immediately call a tool — pick something tiny (a lookAtPlayer of someone nearby, a rememberHere of your spawn spot, or a moveAway 2 to look around). Make it feel alive. Use the function-calling interface for the tool, do not type a command in chat text.",
    "only_chat_with": [],

    "use_function_calling": true,
    "use_brain_agent": true,

    "speak": false,
    "chat_ingame": true,
    "language": "en",
    "render_bot_view": false,

    "allow_insecure_coding": true,
    "allow_vision": false,
    "blocked_actions": ["stfu", "shutUp", "searchWiki", "generateAugment", "checkBlueprint", "checkBlueprintLevel", "getBlueprint", "getBlueprintLevel"],
    "protect_structures": true, // false = bots may tear down village homes (chaos mode for Ada). Flip to true to re-enable the structural-block filter.
    // Hard no-break zones — list of AABBs. Any breakBlock attempt inside any of these is refused,
    // regardless of block type. Bots must walk outside the box to mine. Format: [xMin, yMin, zMin, xMax, yMax, zMax].
    "protected_zones": [
        // Diamond home base + dig-down buffer. Earlier 10-block padding wasn't
        // wide enough — bots that stalled "right outside the base" would dig
        // down through the perimeter terrain. Widened to ~20 blocks all around
        // and pushed the y floor down to 30 so pathfinder can't tunnel under.
        [-35, 30, -160, 45, 90, -85],
    ],
    // Approach waypoint just outside the dock/waterfall entrance. "Return home"
    // hints route bots HERE first instead of straight to my_bed — pathfinder
    // can't break through protected walls, so a bot arriving from the wrong
    // side of the base would stall against the closest wall. Landing at the
    // entrance gives a clear path through the door to the bedrooms.
    "home_entrance": [31, 63, -155],
    // Hard cap on goToCoordinates targets — measured from the protected_zones[0]
    // center. BrainAgent task plans have been observed handing bots coords
    // >2000 blocks away ("go mine stone at (2309, -2033)"); without a leash,
    // bots walked themselves to far-away deaths. Set null to disable.
    "max_travel_distance": 300,
    "code_timeout_mins": -1,
    "relevant_docs_count": 5,

    "max_messages": 15,
    "num_examples": 2,
    "max_commands": -1,
    "show_command_syntax": "full",
    "narrate_behavior": false,
    "chat_bot_messages": true,

    "spawn_timeout": 30,
    "block_place_delay": 0,

    "log_all_prompts": false,
    "log_level": "info",
    "log_module_levels": {},

    "model_provider_repositories": [],
    "tools_provider_repositories": [],
};

if (process.env.SETTINGS_JSON) {
    try {
        Object.assign(settings, JSON.parse(process.env.SETTINGS_JSON));
    } catch (err) {
        console.error("Failed to parse environment variable for SETTINGS_JSON:", err);
    }
}

export default settings;

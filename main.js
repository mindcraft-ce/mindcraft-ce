import * as Mindcraft from './src/mindcraft/mindcraft.js';
import settings from './settings.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { readFileSync } from 'fs';
import { initSTT } from './src/process/stt_process.js';

function parseArguments() {
    return yargs(hideBin(process.argv))
        .option('profiles', {
            type: 'array',
            describe: 'List of agent profile paths',
        })
        .option('task_path', {
            type: 'string',
            describe: 'Path to task file to execute'
        })
        .option('task_id', {
            type: 'string',
            describe: 'Task ID to execute'
        })
        .help()
        .alias('help', 'h')
        .parse();
}
const args = parseArguments();
if (args.profiles) {
    settings.profiles = args.profiles;
}
if (args.task_path) {
    let tasks = JSON.parse(readFileSync(args.task_path, 'utf8'));
    if (args.task_id) {
        settings.task = tasks[args.task_id];
        settings.task.task_id = args.task_id;
    }
    else {
        throw new Error('task_id is required when task_path is provided');
    }
}

// these environment variables override certain settings
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
if (process.env.LOG_ALL) {
    settings.log_all_prompts = process.env.LOG_ALL;
}

Mindcraft.init(false, settings.mindserver_port);

for (let profile of settings.profiles) {
    const profile_json = JSON.parse(readFileSync(profile, 'utf8'));
    settings.profile = profile_json;
    Mindcraft.createAgent(settings);
}
initSTT();


process.on('uncaughtException', (error) => {
    console.error('An error occurred:', error);
    console.error(error.stack || '', error.message || '');

    let suggestedFix = "Not sure. Try asking on Discord, or filing a GitHub issue.";

    if (error.message) {
        if (error.message.includes("ECONNREFUSED")) {
            suggestedFix = `Ensure your game is Open to LAN on port ${settings.port}, and you're playing version ${settings.minecraft_version}. If you're using a different version, change it in settings.js!`;
        } else if (error.message.includes("ERR_MODULE_NOT_FOUND")) {
            suggestedFix = "Run `npm install`.";
        } else if (error.message.includes("ECONNRESET")) {
            suggestedFix = `Make sure that you're playing version ${settings.minecraft_version}. If you're using a different version, change it in settings.js!`;
        } else if (error.message.includes("ERR_DLOPEN_FAILED")) {
            suggestedFix = "Delete the `node_modules` folder, and run `npm install` again.";
        } else if (error.message.includes("Cannot read properties of null (reading 'version')")) {
            suggestedFix = "Try again, with a vanilla Minecraft client - mindcraft-ce doesn't support mods!";
        } else if (error.message.includes("not found in keys.json")) {
            suggestedFix = "Ensure to rename `keys.example.json` to `keys.json`, and fill in the necessary API key.";
        }
    }

    console.log("\n\n✨ Suggested Fix: " + suggestedFix);
    process.exit(1); // Exit the process after handling the error
});
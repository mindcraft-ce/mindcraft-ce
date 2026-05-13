import { History } from './history.js';
import { Coder } from './coder.js';
import { VisionInterpreter } from './vision/vision_interpreter.js';
import { Prompter } from '../models/prompter.js';
import { initModes } from './modes.js';
import { initBot } from '../utils/mcdata.js';
import { containsToolCall, isAction, blacklistTools, isTool, executeTool } from './commands/index.js';
import { isInProtectedZone } from './library/skills.js';
import { ActionManager } from './action_manager.js';
import { NPCContoller } from './npc/controller.js';
import { MemoryBank } from './memory_bank.js';
import { SelfPrompter } from './self_prompter.js';
import convoManager from './conversation.js';
import { handleTranslation, handleEnglishTranslation } from '../utils/translator.js';
import { addBrowserViewer } from './vision/browser_viewer.js';
import { serverProxy, sendOutputToServer } from './mindserver_proxy.js';
import settings from './settings.js';
import { Task } from './tasks/tasks.js';
import { speak } from './speak.js';
import { RAGManager } from './rag/rag_manager.js';
import { BrainAgent } from './agents/brain.js';
import { RPAgent } from './agents/rp.js';
import { TaskAgent } from './agents/task.js';
import { MessageQueue } from './message_queue.js';
import { createLogger } from '../utils/logger.js';
import { getHeartbeatResourcePivot } from './heartbeat_resource_hint.js';

const log = createLogger('Agent');

export class Agent {
    async start(load_mem = false, init_message = null, count_id = 0) {
        this.last_sender = null;
        this.count_id = count_id;

        this.actions = new ActionManager(this);
        this.prompter = new Prompter(this, settings.profile);
        this.name = this.prompter.getName();
        this.rag = new RAGManager(this);
        log.info(`Starting ${this.name}...`);
        this.history = new History(this);
        this.coder = new Coder(this);
        this.npc = new NPCContoller(this);
        this.memory_bank = new MemoryBank(this.name);
        this.memory_bank.load();
        this.self_prompter = new SelfPrompter(this);
        convoManager.initAgent(this);
        if (settings.use_brain_agent) {
            this.messageQueue = new MessageQueue();
            this.brainAgent = new BrainAgent(this, this.messageQueue);
            this.rpAgent = new RPAgent(this);
            this.taskAgent = new TaskAgent(this, this.messageQueue);
            this._activeTaskPromise = null;
            log.info('Brain agent enabled.');
        }
        await this.prompter.initExamples();

        // load mem first before doing task
        let save_data = null;
        if (load_mem) {
            save_data = this.history.load();
        }
        let taskStart = null;
        if (save_data) {
            taskStart = save_data.taskStart;
        } else {
            taskStart = Date.now();
        }
        this.task = new Task(this, settings.task, taskStart);
        this.blocked_actions = settings.blocked_actions.concat(this.task.blocked_actions || []);
        blacklistTools(this.blocked_actions);

        log.info(this.name, 'logging into minecraft...');
        this.bot = initBot(this.name);

        initModes(this);

        this.bot.on('login', () => {
            log.info(this.name, 'logged in!');
            serverProxy.login();

            // Skin handling: leave to server-side plugins (SkinsRestorer auto-applies stored
            // skins by UUID via its join listener). The bot-side /skin commands raced with SR
            // and made Bedrock displays flaky. Fabric Tailor URL form kept for that mod's users.
            const skin = this.prompter.profile.skin;
            if (skin && skin.path && !skin.name) {
                this.bot.chat(`/skin set URL ${skin.model} ${skin.path}`);
            }
        });
        const spawnTimeoutDuration = settings.spawn_timeout;
        const spawnTimeout = setTimeout(() => {
            log.error(`Bot has not spawned after ${spawnTimeoutDuration} seconds. Exiting.`);
            process.exit(0);
        }, spawnTimeoutDuration * 1000);
        this.bot.once('spawn', async () => {
            try {
                clearTimeout(spawnTimeout);
                addBrowserViewer(this.bot, count_id);
                log.info('Initializing vision interpreter...');
                this.vision_interpreter = new VisionInterpreter(this, settings.allow_vision);

                // wait for a bit so stats are not undefined
                await new Promise((resolve) => setTimeout(resolve, 1000));

                log.info(`${this.name} spawned.`);
                this.clearBotLogs();

                // Hard-fence protected zones at the bot.dig level. mineflayer-pathfinder
                // calls bot.dig() directly when its Movements config has canDig=true,
                // which BYPASSES skills.breakBlockAt's zone check. Without this wrap,
                // bots get stuck just outside the base, can't path through, and dig
                // straight down through "protected" blocks because pathfinder picks
                // the dig fallback. Wrapping bot.dig forces pathfinder to find a
                // surface route around the protected zone instead.
                const _origDig = this.bot.dig.bind(this.bot);
                this.bot.dig = async (block, ...args) => {
                    if (block?.position && isInProtectedZone(block.position.x, block.position.y, block.position.z)) {
                        log.info(`${this.name}: pathfinder dig refused at ${block.position.x},${block.position.y},${block.position.z} (protected zone).`);
                        throw new Error('protected zone');
                    }
                    return _origDig(block, ...args);
                };

                this._setupEventHandlers(save_data, init_message);
                this.startEvents();

                if (!load_mem) {
                    if (settings.task) {
                        this.task.initBotTask();
                        this.task.setAgentGoal();
                    }
                } else {
                    // set the goal without initializing the rest of the task
                    if (settings.task) {
                        this.task.setAgentGoal();
                    }
                }

                await new Promise((resolve) => setTimeout(resolve, 10000));
                this.checkAllPlayersPresent();

                // Auto-start the self_prompter so the bot acts on its own when idle.
                // mindcraft-ce's BrainAgent goal manager doesn't drive autonomy by itself,
                // so we kick the legacy self_prompter loop with a character-driven prompt.
                // Respect any prompt loaded from memory.json — only fall back to the
                // default autonomy prompt when nothing was saved.
                if (!this.self_prompter.isActive()) {
                    let prompt = this.self_prompter.prompt;
                    if (!prompt) {
                        prompt = `You are ${this.name}, living autonomously in this Minecraft world with your friends. When idle, pursue a SUSTAINED in-character project that helps the team survive and thrive — not just tiny actions. Examples that fit your personality: gather lots of wood, mine cobblestone, craft tools, build a small structure, plant flowers, find food, scout an area, smelt iron. Pick one project and stick with it across many turns until it's done, then start the next one. Use multi-step tools like collectBlocks(type, count) and executeCode for repeated placements. Avoid trivial actions (lookAtPlayer, repeatedly rememberHere). Help humans only if directly asked. Never stop, never just narrate — every turn must include a concrete tool call advancing your project.`;
                        log.info(`Starting self-prompter with default autonomy prompt for ${this.name}`);
                    } else {
                        log.info(`Resuming self-prompter for ${this.name} with saved prompt (len=${prompt.length})`);
                    }
                    this.self_prompter.start(prompt);
                }

            } catch (error) {
                log.error('Error in spawn event:', error);
                process.exit(0);
            }
        });
    }

    async _setupEventHandlers(save_data, init_message) {
        const ignore_messages = [
            "Set own game mode to",
            "Set the time to",
            "Set the difficulty to",
            "Teleported ",
            "Set the weather to",
            "Gamerule "
        ];

        const respondFunc = async (username, message) => {
            if (message === "") return;
            if (username === this.name) return;
            if (settings.only_chat_with.length > 0 && !settings.only_chat_with.includes(username)) return;
            try {
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                this.shut_up = false;

                log.info(this.name, 'received message from', username, ':', message);

                if (convoManager.isOtherAgent(username)) {
                    log.warn('received whisper from other bot??')
                }
                else {
                    let translation = await handleEnglishTranslation(message);
                    this.handleMessage(username, translation);
                }
            } catch (error) {
                log.error('Error handling message:', error);
            }
        }

        this.respondFunc = respondFunc;

        this.bot.on('whisper', respondFunc);

        this.bot.on('chat', (username, message) => {
            // Multi-agent: only respond to public chat if message mentions this bot's name
            // or uses a broadcast keyword. /msg <bot> still works via whisper handler above.
            if (serverProxy.getNumOtherAgents() > 0) {
                const lower = message.toLowerCase();
                const myName = this.name.toLowerCase();
                const broadcastWords = ['everyone', 'everybody', 'all of you', "y'all", 'yall', 'you guys', 'you all', 'team', 'critters'];
                const addressed = lower.includes(myName) || broadcastWords.some(w => lower.includes(w));
                if (!addressed) return;
            }
            respondFunc(username, message);
        });

        // Set up auto-eat
        this.bot.autoEat.options = {
            priority: 'foodPoints',
            startAt: 14,
            bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
        };

        if (save_data?.self_prompt) {
            if (init_message) {
                this.history.add('system', init_message);
            }
            await this.self_prompter.handleLoad(save_data.self_prompt, save_data.self_prompting_state);
        }
        if (save_data?.last_sender) {
            this.last_sender = save_data.last_sender;
            if (convoManager.otherAgentInGame(this.last_sender)) {
                const msg_package = {
                    message: `You have restarted and this message is auto-generated. Continue the conversation with me.`,
                    start: true
                };
                convoManager.receiveFromBot(this.last_sender, msg_package);
            }
        }
        else if (init_message) {
            await this.handleMessage('system', init_message, 2);
        }
        else {
            this.openChat("Hello world! I am " + this.name);
        }
    }

    checkAllPlayersPresent() {
        if (!this.task || !this.task.agent_names) {
            return;
        }

        const missingPlayers = this.task.agent_names.filter(name => !this.bot.players[name]);
        if (missingPlayers.length > 0) {
            log.warn(`Missing players/bots: ${missingPlayers.join(', ')}`);
            this.cleanKill('Not all required players/bots are present in the world. Exiting.', 4);
        }
    }

    requestInterrupt() {
        this.bot.interrupt_code = true;
        this.bot.stopDigging();
        this.bot.collectBlock.cancelTask();
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
    }

    clearBotLogs() {
        this.bot.output = '';
        this.bot.interrupt_code = false;
    }

    shutUp() {
        this.shut_up = true;
        if (this.self_prompter.isActive()) {
            this.self_prompter.stop(false);
        }
        convoManager.endAllConversations();
    }

    async handleMessage(source, message, max_responses = null) {
        await this.checkTaskDone();
        if (!source || !message) {
            log.warn('Received empty message from', source);
            return false;
        }

        let used_command = false;
        if (max_responses === null) {
            max_responses = settings.max_commands === -1 ? Infinity : settings.max_commands;
        }
        if (max_responses === -1) {
            max_responses = Infinity;
        }


        const self_prompt = source === 'system' || source === this.name;
        const from_other_bot = convoManager.isOtherAgent(source);

        // Heartbeat fast-path: route self-prompt ticks to local idle_model with simple
        // !command parsing. Bypasses BrainAgent → TaskAgent → API calls entirely.
        // User-driven messages still flow through the full Brain/Task path on chat_model.
        if (self_prompt && message.includes('Self-prompt tick') && this.prompter?.idle_model) {
            return await this._handleHeartbeatLocal(message);
        }

        if (!self_prompt && !from_other_bot) { // from user, check for forced commands
            const user_command_name = containsToolCall(message);
            if (user_command_name) {
                if (!isTool(user_command_name)) {
                    this.routeResponse(source, `Command '${user_command_name}' does not exist.`);
                    return false;
                }
                this.routeResponse(source, `*${source} used ${user_command_name.substring(1)}*`);
                let execute_res = await executeTool(this, message);
                if (execute_res)
                    this.routeResponse(source, execute_res);
                return true;
            }
        }

        if (from_other_bot)
            this.last_sender = source;

        // Now translate the message
        message = await handleEnglishTranslation(message);
        log.info('received message from', source, ':', message);

        if (settings.use_brain_agent && this.brainAgent) {
            try {
                const decision = await this.brainAgent.processRequest(source, message);
                // For self-prompt autonomy ticks, force route=task. BrainAgent often misroutes
                // these to rp because they read as character behavior; but rp never calls tools,
                // so the bot just narrates and then idles. Forcing task makes self-prompts actually act.
                if (decision && self_prompt && decision.route === 'rp') {
                    log.info('Self-prompt rerouted from rp → task to ensure tool execution');
                    decision.route = 'task';
                    decision.task_action = decision.task_action || 'start';
                    if (!decision.task_description) decision.task_description = 'Take one small in-character action right now.';
                    if (!decision.task_system_prompt) decision.task_system_prompt = `You are ${this.name} acting autonomously per your character. Pick ONE small action that fits your personality (lookAtPlayer, rememberHere, moveAway, goToCoordinates within ~10 blocks, collectBlocks of 1-2 nearby items, placeHere a torch, etc) and call it via the function-calling tool. Do not just chat.`;
                }
                if (!decision) {
                    log.info('No brain decision, falling through.');
                } else if (decision.route === 'queued') {
                    return false;
                } else if (decision.route === 'rp') {
                    const reply = await this.rpAgent.respond(source, message, decision);
                    if (reply) this.routeResponse(source, reply);
                    return false;
                } else if (decision.route === 'task') {
                    const taskAction = decision.task_action || 'start';

                    if (this.taskAgent.is_running && taskAction === 'inject') {
                        this.messageQueue.enqueue({
                            source,
                            message: decision.task_description || message,
                            type: 'context'
                        });
                        const reply = await this.rpAgent.respond(source, message, decision);
                        if (reply) this.routeResponse(source, reply);
                        return false;
                    } else if (this.taskAgent.is_running && taskAction === 'cancel_and_start') {
                        this.messageQueue.enqueue({ source, message: 'cancel', type: 'cancel' });
                        if (this._activeTaskPromise) {
                            try { await this._activeTaskPromise; } catch (e) { /* ignore */ }
                        }
                    }

                    const ackReply = await this.rpAgent.respond(source, message, decision);
                    if (ackReply) this.routeResponse(source, ackReply);

                    this._activeTaskPromise = this.taskAgent.performTask(
                        decision.task_description, decision.task_system_prompt
                    ).then(result => {
                        this.brainAgent.recordTaskOutcome(result);
                        if (result.chat_response) this.routeResponse(source, result.chat_response);
                        this._activeTaskPromise = null;
                    }).catch(error => {
                        log.error('Task failed:', error.message);
                        this.routeResponse(source, 'Task failed unexpectedly.');
                        this._activeTaskPromise = null;
                    });

                    return false;
                }
            } catch (error) {
                log.error('Brain error, falling through:', error.message);
            }
        }

        // legacy handler
        log.warn('Legacy path — set use_brain_agent=true in settings.');

        const checkInterrupt = () => this.self_prompter.shouldInterrupt(self_prompt) || this.shut_up || convoManager.responseScheduledFor(source);

        let behavior_log = this.bot.modes.flushBehaviorLog().trim();
        if (behavior_log.length > 0) {
            const MAX_LOG = 500;
            if (behavior_log.length > MAX_LOG) {
                behavior_log = '...' + behavior_log.substring(behavior_log.length - MAX_LOG);
            }
            behavior_log = 'Recent behaviors log: \n' + behavior_log;
            await this.history.add('system', behavior_log);
        }

        // Handle other user messages
        await this.history.add(source, message);
        this.history.save();



        if (!self_prompt && this.self_prompter.isActive()) // message is from user during self-prompting
            max_responses = 1; // force only respond to this message, then let self-prompting take over

        let res = null;
        let tools_called = null;

        for (let i = 0; i < max_responses; i++) {
            if (checkInterrupt()) break;
            let history = this.history.getHistory();

            [res, tools_called] = await this.prompter.promptConvo(history);

            // if res is not valid JSON, ignore it completely and let chat_response be ''
            let chat_response = '';
            try {
                let parsed = JSON.parse(res);
                if (parsed.chat_response)
                    chat_response = parsed.chat_response;
            } catch (e) {
                log.debug('Response was not valid JSON, ignoring chat response.');
                log.debug('Full response:', res);
                res = null;
            }

            log.debug(`${this.name} full response to ${source}: ""${res}""`);
            log.debug(`${this.name} tools called:`, tools_called);

            if (!res || res.length === 0) {
                log.warn('no response')
                if (tools_called === null || tools_called === undefined || tools_called.length === 0)
                    break; // empty response ends loop
            }

            if (tools_called.length > 0) {
                let real_tools = [];
                for (const tool_call of tools_called) {
                    if (isAction(tool_call.name)) {
                        log.info('Agent decided to use action:', tool_call.name);
                        real_tools.push(tool_call);
                    }
                    else if (isTool(tool_call.name) && !isAction(tool_call.name)) {
                        log.debug('Agent tried to use non-action tool:', tool_call.name);
                    }
                    else {
                        this.history.add('system', `Command ${tool_call.name} does not exist.`);
                        log.warn('Agent hallucinated command:', tool_call.name)
                    }
                }

                let one_of_them_is_action = real_tools.some(tool_call => isAction(tool_call.name));


                if (checkInterrupt()) break;
                this.self_prompter.handleUserPromptedCmd(self_prompt, one_of_them_is_action);
                let execute_res = "";
                let chat_message = chat_response;
                for (const tool_call of real_tools) {

                    if (settings.show_command_syntax === "full") {
                        chat_message = chat_message.replace(new RegExp(`!${tool_call.name}(\\([^)]*\\))?`, 'g'), '');

                        let args_list = [];
                        for (const param of Object.values(tool_call.arguments)) {
                            args_list.push(JSON.stringify(param));
                        }
                        let args_str = args_list.join(',');
                        chat_message += ` *used ${tool_call.name}(${args_str})* `;

                    }
                    else if (settings.show_command_syntax === "shortened") {
                        chat_message = `*used ${tool_call.name}* `;
                    }

                    if (real_tools.length == 1)
                        this.routeResponse(source, chat_message);

                    let _execute_res = await executeTool(this, tool_call.name, tool_call.arguments);

                    if (_execute_res)
                        execute_res += _execute_res + "\n\n";

                    log.debug('Agent executed:', tool_call.name, 'and got:', execute_res);
                    used_command = true;
                }

                if (real_tools.length > 1) {
                    this.routeResponse(source, chat_message);
                }



                if (execute_res)
                    this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                this.history.add(this.name, res);
                if (chat_response !== null && chat_response.length > 0) {
                    this.routeResponse(source, chat_response);
                }
                break;
            }

            this.history.save();
        }
        if (res) {
            try {
                let response = JSON.parse(res);
                if (!response.work_done && this.prompter.tool_type == "tools") {
                    let new_response = "You told yourself you are not done yet. Continue your work.";
                    new_response += "\n\n Please be sure to use tools as needed to accomplish your goals.";
                    new_response += "\n\n You told yourself this: " + (response.next_steps_explained ? response.next_steps_explained : "");
                    this.handleMessage('system', new_response)
                }
            } catch (e) {
                log.debug('No follow-up self-prompting needed.');
            }
        }
        return used_command;
    }

    // Lightweight heartbeat handler. Skips BrainAgent + TaskAgent + RPAgent entirely
    // and routes self-prompt ticks to the local idle_model (Ollama andy-4-micro typically).
    // Returns true if a command was successfully executed, false otherwise. The
    // self_prompter uses this return value to track its no-command streak.
    async _handleHeartbeatLocal(message) {
        try {
            // Yield when a real task is in flight. The heartbeat fast-path is for
            // IDLE behavior; if pathfinder is actively moving (e.g. TaskAgent
            // navigating to the dock entrance after a respawn) or a tool is
            // currently executing, firing another inventory-driven command will
            // override the navigation and walk the bot in the wrong direction.
            if (this.bot?.pathfinder?.isMoving?.() || this.actions?.executing) {
                return false;
            }
            // Slim system prompt — local model needs concise instructions and tool examples.
            const personaMatch = (this.prompter?.profile?.conversing || '').match(/personality:\s*([^\n]+?)(?=\.\s|$)/i);
            const persona = personaMatch ? personaMatch[1].trim() : 'a friendly Smiling Critters character';

            // Inventory snapshot — keeps the prompt grounded so the model picks
            // achievable actions (e.g. don't try to mine stone with no pickaxe).
            const inv = this.bot?.inventory?.items() || [];
            const counts = {};
            for (const it of inv) counts[it.name] = (counts[it.name] || 0) + (it.count || 1);
            const invBrief = Object.entries(counts).slice(0, 12).map(([k,v]) => `${k}:${v}`).join(', ') || '(empty)';
            const hasPickaxe = inv.some(i => i.name.endsWith('_pickaxe'));
            const hasAxe = inv.some(i => i.name.endsWith('_axe') && !i.name.endsWith('_pickaxe'));
            // Sum across all natural log/plank/sapling types — biome-agnostic.
            const logTypes = ['oak_log','birch_log','spruce_log','jungle_log','acacia_log','dark_oak_log','mangrove_log','cherry_log'];
            const plankTypes = logTypes.map(l => l.replace('_log','_planks'));
            const totalLogs = logTypes.reduce((s,t) => s + (counts[t] || 0), 0);
            const planksCount = plankTypes.reduce((s,t) => s + (counts[t] || 0), 0);
            const stickCount = counts['stick'] || 0;
            // Pick the dominant log type the bot already has, else default to oak.
            const preferredLog = logTypes.reduce((best,t) => (counts[t] || 0) > (counts[best] || 0) ? t : best, 'oak_log');

            // Tool-priority chain: deterministic next-action hint based on what's missing.
            // Biome-agnostic — accepts any natural log/plank type, not just oak.
            const lastCmd = this.lastHeartbeat?.command;
            const lastOk = this.lastHeartbeat?.succeeded;
            // Stuck-loop break. The local idle model anchors hard on its last
            // command and will retry collectBlocks/searchForBlock for the same
            // target indefinitely when the resource isn't in the area. After
            // 3 consecutive soft-failures on the same (cmd:firstArg) we
            // override priorityHint to send the bot home.
            const stuckCount = this.lastHeartbeat?.streakCount || 0;
            const stuckKey = this.lastHeartbeat?.streakKey || '';
            const isStuck = stuckCount >= 3 && /^(collectBlocks|searchForBlock):/.test(stuckKey);
            const resourcePivot = getHeartbeatResourcePivot(this.lastHeartbeat);
            let priorityHint = '';
            if (resourcePivot) {
                priorityHint = resourcePivot.hint;
            } else if (isStuck) {
                const stuckTarget = stuckKey.split(':').slice(1).join(':') || 'that resource';
                const stuckBed = this.memory_bank?.recallPlace('my_bed');
                const stuckEntry = settings.home_entrance;
                if (stuckEntry) {
                    priorityHint = `PRIORITY: STUCK LOOP — ${stuckKey} failed ${stuckCount}× in a row. ${stuckTarget} is not reachable from here. Stop searching. Head to the dock entrance NOW: !goToCoordinates(${stuckEntry[0]}, ${stuckEntry[1]}, ${stuckEntry[2]}, 2). From there you can walk through the door to your bed.`;
                } else if (stuckBed) {
                    priorityHint = `PRIORITY: STUCK LOOP — ${stuckKey} failed ${stuckCount}× in a row. ${stuckTarget} is not reachable from here. Stop searching. Return home NOW: !goToCoordinates(${stuckBed[0]}, ${stuckBed[1]+1}, ${stuckBed[2]}, 2).`;
                } else {
                    priorityHint = `PRIORITY: STUCK LOOP — ${stuckKey} failed ${stuckCount}× in a row. Stop trying ${stuckTarget}. Call !goToPlayer("justFielding", 3) to regroup.`;
                }
            } else if (!hasPickaxe) {
                if (totalLogs < 1) {
                    // Search-then-collect alternation. The local model anchors on
                    // whatever it just did, so we must explicitly force the next
                    // step. After a successful searchForBlock the bot has been
                    // teleported on top of a log — collect NOW.
                    if (lastCmd === 'searchForBlock' && lastOk) {
                        priorityHint = 'PRIORITY: You just teleported next to a log. Call !collectBlocks("any_log", 4) RIGHT NOW. Do NOT call searchForBlock again — you are already there.';
                    } else if (lastCmd === 'collectBlocks' && !lastOk) {
                        priorityHint = 'PRIORITY: No logs within reach. Call !searchForBlock("any_log", 128) to find a tree.';
                    } else {
                        priorityHint = 'PRIORITY: No logs. First call !collectBlocks("any_log", 4) — alias matches oak/birch/spruce/jungle/acacia/dark_oak/mangrove/cherry. Only if it says "no logs nearby" should you call !searchForBlock("any_log", 128).';
                    }
                } else if (planksCount < 4) {
                    const plankType = preferredLog.replace('_log','_planks');
                    priorityHint = `PRIORITY: Convert your logs to planks. Call !craftRecipe("${plankType}", 4).`;
                } else if (stickCount < 2) {
                    priorityHint = 'PRIORITY: Make sticks. Call !craftRecipe("stick", 4).';
                } else {
                    priorityHint = 'PRIORITY: Make a wooden pickaxe. Call !craftRecipe("wooden_pickaxe", 1).';
                }
            }

            // Last-action memory: tell the model what just happened so it
            // doesn't lock into a failing-command loop (e.g. craftRecipe(stick)
            // looped 644× in one session because every tick was stateless).
            let lastActionHint = '';
            if (this.lastHeartbeat) {
                const lh = this.lastHeartbeat;
                if (lh.succeeded) {
                    lastActionHint = `Last action: !${lh.command} succeeded.`;
                } else {
                    const errBrief = (lh.error || '').toString().slice(0, 120);
                    lastActionHint = `Last action: !${lh.command} FAILED${errBrief ? ' (' + errBrief + ')' : ''}. Try a DIFFERENT type of action this turn.`;
                }
            }

            // Pull a short summary of the bot's long-running project so the
            // local model picks actions that advance it, not random tool calls.
            // Skip the first sentence (typically the persona intro "You are X...")
            // — the actionable project content is in the sentences after it.
            const selfPromptRaw = (this.self_prompter?.prompt || '').toString();
            const firstPeriod = selfPromptRaw.indexOf('.');
            const projectStart = firstPeriod > 0 && firstPeriod < 80 ? firstPeriod + 1 : 0;
            const projectBrief = selfPromptRaw.slice(projectStart, projectStart + 400).trim();
            const projectLine = projectBrief ? `CURRENT PROJECT: ${projectBrief}\nPick the action that best advances this project. If the project mentions a location or coordinates, work THERE — do not invent other coordinates.\n\n` : '';

            // Inventory + distance hint: bias bots toward returning home / depositing
            // before they wander too far and lose everything to a death.
            const totalItems = inv.reduce((s, i) => s + (i.count || 1), 0);
            const myShulker = this.memory_bank?.recallPlace('my_shulker');
            const myBed = this.memory_bank?.recallPlace('my_bed');
            const pos = this.bot?.entity?.position;
            let storageHint = '';
            if (myShulker && totalItems >= 8) {
                storageHint = `\nYou have ${totalItems} items and a bound storage shulker at ${myShulker[0]},${myShulker[1]},${myShulker[2]}. Consider !depositToMyShulker() to stash them safely before risking a death-loss.`;
            } else if (myBed && totalItems >= 4 && pos) {
                const dx = pos.x - myBed[0], dz = pos.z - myBed[2];
                const distFromBed = Math.hypot(dx, dz);
                if (distFromBed > 80) {
                    const entry = settings.home_entrance;
                    const target = entry
                        ? `!goToCoordinates(${entry[0]}, ${entry[1]}, ${entry[2]}, 2) — that's the dock entrance; from there walk through the door to your bed`
                        : `!goToCoordinates(${myBed[0]}, ${myBed[1]+1}, ${myBed[2]}, 2)`;
                    storageHint = `\nYou are ${Math.round(distFromBed)} blocks from your bed and have ${totalItems} items. Consider ${target} to return home before you wander further and lose them.`;
                }
            }

            // Operating radius hint. The local idle model keeps generating wild
            // far targets (observed: 4000+ blocks), which goToCoordinates then
            // refuses via the travel leash. Telling the model the radius up
            // front lets it pick a closer goal instead of burning ticks on
            // refused targets.
            let radiusHint = '';
            const zonesH = settings.protected_zones;
            if (settings.max_travel_distance && Array.isArray(zonesH) && zonesH[0]) {
                const z0 = zonesH[0];
                const cx = Math.round((z0[0] + z0[3]) / 2);
                const cz = Math.round((z0[2] + z0[5]) / 2);
                radiusHint = `\nOPERATING RADIUS: stay within ${settings.max_travel_distance} blocks of base center (x≈${cx}, z≈${cz}). NEVER call !goToCoordinates with x,z farther than that — the system refuses it. To "explore" or "find a biome", pick coords near base.\n`;
            }

            const system = `${priorityHint}\n\n${projectLine}You are ${this.name}, ${persona}. You are idle in Minecraft and must take ONE small in-character action right now.\n\nYour current inventory: ${invBrief}\nHas wooden pickaxe: ${hasPickaxe}    Has axe: ${hasAxe}\n${lastActionHint}${storageHint}${radiusHint}\n\nFollow the PRIORITY above exactly. Reply with EXACTLY ONE command in the format !commandName(arg1, arg2). No chat. No explanation. Just the command.\n\nUseful commands:\n!collectBlocks("any_log", 4)\n!craftRecipe("oak_planks", 4)\n!craftRecipe("stick", 4)\n!craftRecipe("wooden_pickaxe", 1)\n!craftRecipe("wooden_axe", 1)\n!equip("wooden_pickaxe")\n!placeHere("dirt")\n!goToCoordinates(3, 51, -122, 2)\n!goToPlayer("justFielding", 3)\n!searchForBlock("any_log", 128)\n!consume("bread")\n!depositToMyShulker()  // stash materials in your storage box (auto-bound after sleeping)\n!worldEditFill(x1, y1, z1, x2, y2, z2, "stone")  // FAST: fills a whole region instantly\n\nThese tools are NOT available in this build. Never call them: !newAction, !goal, !endGoal, !startConversation, !endConversation, !setMode, !searchWiki, !shutUp, !stfu.`;
            const turns = [{ role: 'user', content: message }];

            // Pass null tools + null responseFormat so we don't inherit ollama.js's
            // default `responseFormatSchema` (the BrainAgent JSON schema). The local
            // model can't satisfy that schema and Ollama returns 500.
            let raw = await this.prompter.idle_model.sendRequest(turns, system, [], null);
            // ollama returns string; gpt-style returns [text, function_calls]
            if (Array.isArray(raw)) raw = raw[0];
            if (typeof raw !== 'string' || !raw.trim()) {
                return false;
            }

            // Find the first !commandName(...) in the response
            const m = raw.match(/!(\w+)\s*(?:\(([^)]*)\))?/);
            if (!m) {
                log.info(`Heartbeat[${this.name}]: idle_model produced no command (got "${raw.slice(0, 80)}")`);
                return false;
            }
            const cmdName = m[1];
            const rawArgs = m[2] || '';

            if (!isTool(cmdName)) {
                log.info(`Heartbeat[${this.name}]: hallucinated tool '${cmdName}'`);
                return false;
            }
            if (settings.blocked_actions && settings.blocked_actions.includes(cmdName)) {
                log.info(`Heartbeat[${this.name}]: tool '${cmdName}' is blocked`);
                return false;
            }
            // Heartbeat-specific deny list: valid tools that aren't useful for idle autonomy.
            // Stops/queries/etc. are wasted ticks — return false so loop tries something productive.
            // digDown is on this list because it actively gets bots killed (drowning, lava, fall)
            // when the local model picks it as a "let's mine down" idle action with no plan.
            // searchForEntity / nearbyBlocks / entities are pure information queries — bot has
            // no follow-through, just wastes a tick.
            const heartbeatSkip = new Set([
                'stop', 'stats', 'inventory', 'setMode', 'goal', 'endGoal',
                'startConversation', 'endConversation', 'restart', 'clearChat',
                'rememberHere', 'digDown', 'searchForEntity', 'nearbyBlocks',
                'entities', 'savedPlaces', 'getCraftingPlan', 'lookAtPlayer',
            ]);
            if (heartbeatSkip.has(cmdName)) {
                log.info(`Heartbeat[${this.name}]: skipping non-productive tool '${cmdName}'`);
                return false;
            }
            // Hard alternation: if last heartbeat was searchForBlock, refuse a
            // back-to-back searchForBlock. The bot has already been teleported
            // to the target block; the productive next step is collectBlocks.
            // Without this the small local model loops on search forever.
            if (this.lastHeartbeat?.command === 'searchForBlock' && cmdName === 'searchForBlock') {
                log.info(`Heartbeat[${this.name}]: blocking back-to-back searchForBlock — forcing alternation`);
                return false;
            }

            // Parse args: split on commas not inside quotes, strip surrounding quotes, coerce numbers
            const argsArr = [];
            if (rawArgs.trim()) {
                const tokens = rawArgs.match(/"[^"]*"|'[^']*'|[^,]+/g) || [];
                for (const t of tokens) {
                    const trimmed = t.trim();
                    if (/^["'].*["']$/.test(trimmed)) {
                        argsArr.push(trimmed.slice(1, -1));
                    } else if (!isNaN(Number(trimmed))) {
                        argsArr.push(Number(trimmed));
                    } else if (trimmed === 'true') argsArr.push(true);
                    else if (trimmed === 'false') argsArr.push(false);
                    else argsArr.push(trimmed);
                }
            }

            log.info(`Heartbeat[${this.name}] → !${cmdName}(${argsArr.map(a => JSON.stringify(a)).join(', ')})`);

            try {
                const execRes = await executeTool(this, cmdName, argsArr);
                // Heartbeat tool output is autonomous internal behavior — keep it in the
                // mindcraft logs but DON'T broadcast to public chat. Reduces chat flood.
                // Direct user→bot chat (BrainAgent → TaskAgent → chat_response) still
                // reaches public chat via its own routeResponse calls.
                if (execRes && typeof execRes === 'string') {
                    log.info(`Heartbeat[${this.name}] result: ${execRes.slice(0, 200)}`);
                }
                // Treat tool messages containing "No <x> nearby", "Collected 0",
                // "Could not find", "Don't have", "Failed", "Invalid" as soft failures so the next
                // tick is nudged to try something different.
                const resStr = (execRes || '').toString();
                const softFail = /\b(No |Collected 0|Could not find|Don't have|Failed|Invalid|nearby to collect)/i.test(resStr);
                const newStreakKey = `${cmdName}:${argsArr[0] ?? ''}`;
                const prevKey = this.lastHeartbeat?.streakKey;
                const prevCount = this.lastHeartbeat?.streakCount || 0;
                const streakCount = softFail ? (newStreakKey === prevKey ? prevCount + 1 : 1) : 0;
                this.lastHeartbeat = { command: cmdName, succeeded: !softFail, error: softFail ? resStr.slice(0, 120) : null, streakKey: newStreakKey, streakCount };
                return true;
            } catch (err) {
                log.warn(`Heartbeat[${this.name}] tool '${cmdName}' failed: ${err.message}`);
                const newStreakKey = `${cmdName}:${argsArr[0] ?? ''}`;
                const prevKey = this.lastHeartbeat?.streakKey;
                const prevCount = this.lastHeartbeat?.streakCount || 0;
                const streakCount = newStreakKey === prevKey ? prevCount + 1 : 1;
                this.lastHeartbeat = { command: cmdName, succeeded: false, error: err.message, streakKey: newStreakKey, streakCount };
                return false;
            }
        } catch (err) {
            log.error(`Heartbeat[${this.name}] LLM call failed: ${err.message}`);
            return false;
        }
    }

    async routeResponse(to_player, message) {
        if (this.shut_up) return;
        let self_prompt = to_player === 'system' || to_player === this.name;
        if (self_prompt && this.last_sender) {
            // this is for when the agent is prompted by system while still in conversation
            // so it can respond to events like death but be routed back to the last sender
            to_player = this.last_sender;
        }

        if (convoManager.isOtherAgent(to_player) && convoManager.inConversation(to_player)) {
            // if we're in an ongoing conversation with the other bot, send the response to it
            convoManager.sendToBot(to_player, message);
        }
        else {
            // otherwise, use open chat
            this.openChat(message);
            // note that to_player could be another bot, but if we get here the conversation has ended
        }
    }

    async openChat(message) {
        let to_translate = message;
        let remaining = '';
        let command_name = containsToolCall(message);
        let translate_up_to = command_name ? message.indexOf(command_name) : -1;
        if (translate_up_to != -1) { // don't translate the command
            to_translate = to_translate.substring(0, translate_up_to);
            remaining = message.substring(translate_up_to);
        }
        message = (await handleTranslation(to_translate)).trim() + " " + remaining;
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replaceAll('\n', ' ');

        if (settings.only_chat_with.length > 0) {
            for (let username of settings.only_chat_with) {
                this.bot.whisper(username, message);
            }
        }
        else {
            if (settings.speak) {
                speak(to_translate, this.prompter.profile.speak_model);
            }
            if (settings.chat_ingame) { this.bot.chat(message); }
            sendOutputToServer(this.name, message);
        }
    }

    startEvents() {
        // Custom events
        this.bot.on('time', () => {
            if (this.bot.time.timeOfDay == 0)
                this.bot.emit('sunrise');
            else if (this.bot.time.timeOfDay == 6000)
                this.bot.emit('noon');
            else if (this.bot.time.timeOfDay == 12000)
                this.bot.emit('sunset');
            else if (this.bot.time.timeOfDay == 18000)
                this.bot.emit('midnight');
        });

        let prev_health = this.bot.health;
        this.bot.lastDamageTime = 0;
        this.bot.lastDamageTaken = 0;
        this.bot.on('health', () => {
            if (this.bot.health < prev_health) {
                this.bot.lastDamageTime = Date.now();
                this.bot.lastDamageTaken = prev_health - this.bot.health;
            }
            prev_health = this.bot.health;
        });
        // Logging callbacks
        this.bot.on('error', (err) => {
            log.error('Error event!', err);
        });
        this.bot.on('end', (reason) => {
            log.warn('Bot disconnected! Killing agent process.', reason)
            this.cleanKill('Bot disconnected! Killing agent process.');
        });
        this.bot.on('death', () => {
            this.actions.cancelResume();
            this.actions.stop();
        });
        this.bot.on('kicked', (reason) => {
            log.warn('Bot kicked!', reason);
            this.cleanKill('Bot kicked! Killing agent process.');
        });
        this.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                log.info('Agent died:', message);
                let death_pos = this.bot.entity.position;
                this.memory_bank.rememberPlace('last_death_position', death_pos.x, death_pos.y, death_pos.z);
                let death_pos_text = null;
                if (death_pos) {
                    death_pos_text = `x: ${death_pos.x.toFixed(2)}, y: ${death_pos.y.toFixed(2)}, z: ${death_pos.z.toFixed(2)}`;
                }
                // Corpse-run leash. BrainAgent reliably routes a respawn into a
                // "go retrieve last_death_position" task; when the death was far
                // from base that task walks the bot straight back to the same
                // hazard (drowning, lava, skeletons). Suppress the suggestion
                // when the death is >150 blocks from the protected_zones AABB.
                let recoveryHint = `Your place of death is saved as 'last_death_position' if you want to return.`;
                if (death_pos && settings.protected_zones && settings.protected_zones[0]) {
                    const pz = settings.protected_zones[0];
                    const cx = (pz[0] + pz[3]) / 2, cz = (pz[2] + pz[5]) / 2;
                    const dist = Math.hypot(death_pos.x - cx, death_pos.z - cz);
                    if (dist > 150) {
                        const entry = settings.home_entrance;
                        const route = entry
                            ? `Head to the dock entrance at !goToCoordinates(${entry[0]}, ${entry[1]}, ${entry[2]}, 2) and walk through the door to your bed.`
                            : `Return home via your my_bed coordinates.`;
                        recoveryHint = `You died ${Math.round(dist)} blocks from base — TOO FAR to corpse-run. DO NOT navigate to last_death_position. ${route} Abandon the lost items.`;
                    }
                }
                let dimention = this.bot.game.dimension;
                this.handleMessage('system', `You died at position ${death_pos_text || "unknown"} in the ${dimention} dimension with the final message: '${message}'. ${recoveryHint} Previous actions were stopped and you have respawned.`);
            }
        });
        this.bot.on('idle', () => {
            this.bot.clearControlStates();
            this.bot.pathfinder.stop(); // clear any lingering pathfinder
            this.bot.modes.unPauseAll();
            setTimeout(() => {
                if (this.isIdle()) {
                    this.actions.resumeAction();
                }
            }, 1000);
        });

        // Init NPC controller
        this.npc.init();

        // This update loop ensures that each update() is called one at a time, even if it takes longer than the interval
        const INTERVAL = 300;
        let last = Date.now();
        setTimeout(async () => {
            while (true) {
                let start = Date.now();
                await this.update(start - last);
                let remaining = INTERVAL - (Date.now() - start);
                if (remaining > 0) {
                    await new Promise((resolve) => setTimeout(resolve, remaining));
                }
                last = start;
            }
        }, INTERVAL);

        this.bot.emit('idle');
    }

    async update(delta) {
        await this.bot.modes.update();
        this.self_prompter.update(delta);
        await this.checkTaskDone();
        this._stuckRescueCheck();
    }

    // Stuck auto-rescue: if the bot has been below y=50 for >60s, /tp it to the
    // nearest human player. Pathfinder often can't escape cave/hole drops, and
    // sessions accumulate dozens of underground stuck events that need manual
    // /tp from console. Cheat mode is enabled in the assistant profile, so the
    // bot can run /tp on itself.
    _stuckRescueCheck() {
        try {
            const pos = this.bot?.entity?.position;
            if (!pos) return;
            const now = Date.now();
            if (!this._stuckCheck) {
                this._stuckCheck = { lastSurfaceTime: now, lastRescueAt: 0 };
            }
            if (pos.y >= 50) {
                this._stuckCheck.lastSurfaceTime = now;
                return;
            }
            const elapsed = now - this._stuckCheck.lastSurfaceTime;
            if (elapsed < 60000) return;
            // Cooldown so we don't spam /tp every tick once stuck.
            if (now - this._stuckCheck.lastRescueAt < 30000) return;

            const botNames = new Set(convoManager.getInGameAgents());
            const humans = Object.keys(this.bot.players || {})
                .filter(n => n && n !== this.name && !botNames.has(n));
            if (humans.length === 0) return;
            // Prefer a human with a loaded entity (in render distance) so /tp
            // lands somewhere safe and present.
            const withEntity = humans.find(n => this.bot.players[n]?.entity);
            const target = withEntity || humans[0];
            log.warn(`Heartbeat[${this.name}] stuck rescue: y=${pos.y.toFixed(1)} for ${(elapsed/1000)|0}s — /tp to ${target}`);
            this.bot.chat(`/tp @s ${target}`);
            this._stuckCheck.lastRescueAt = now;
            this._stuckCheck.lastSurfaceTime = now;
        } catch (err) {
            // Don't let rescue logic break the update loop.
            log.warn(`stuckRescueCheck[${this.name}] error: ${err.message}`);
        }
    }

    isIdle() {
        return !this.actions.executing;
    }


    cleanKill(msg = 'Killing agent process...', code = 1) {
        this.history.add('system', msg);
        this.bot.chat(code > 1 ? 'Restarting.' : 'Exiting.');
        this.history.save();
        process.exit(code);
    }
    async checkTaskDone() {
        if (this.task.data) {
            let res = this.task.isDone();
            if (res) {
                await this.history.add('system', `Task ended with score : ${res.score}`);
                await this.history.save();
                // await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 second for save to complete
                log.info('Task finished:', res.message);
                this.killAll();
            }
        }
    }

    killAll() {
        serverProxy.shutdown();
    }
}

import { getBlockId, getItemId } from '../../utils/mcdata.js';
import { actionsList } from './actions.js';
import { queryList } from './queries.js';
import { normalizePlacementItemName } from './placement_aliases.js';

let suppressNoDomainWarning = true;

const commandList = queryList.concat(actionsList);
const commandMap = {};
for (const command of commandList) {
    commandMap[command.name] = command;
}

export function getCommand(name) {
    return commandMap[name];
}

export function blacklistCommands(commands) {
    const unblockable = ['!stop', '!stats', '!inventory', '!goal'];
    for (const command_name of commands) {
        if (unblockable.includes(command_name)) {
            console.warn(`Command ${command_name} is unblockable`);
            continue;
        }

        delete commandMap[command_name];
        const index = commandList.findIndex(command => command.name === command_name);
        if (index !== -1) {
            commandList.splice(index, 1);
        }
    }
}

const commandRegex = /!(\w+)(?:\(((?:-?\d+(?:\.\d+)?|true|false|"[^"]*")(?:\s*,\s*(?:-?\d+(?:\.\d+)?|true|false|"[^"]*"))*)\))?/;
const argRegex = /-?\d+(?:\.\d+)?|true|false|"[^"]*"/g;

export function containsCommand(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch)
        return '!' + commandMatch[1];
    return null;
}

export function commandExists(commandName) {
    if (!commandName.startsWith('!'))
        commandName = '!' + commandName;
    return commandMap[commandName] !== undefined;
}

function parseBoolean(input) {
    switch(input.toLowerCase()) {
        case 'false':
        case 'f':
        case '0':
        case 'off':
            return false;
        case 'true':
        case 't':
        case '1':
        case 'on':
            return true;
        default:
            return null;
    }
}

function checkInInterval(number, lowerBound, upperBound, endpointType) {
    switch (endpointType) {
        case '[)': return lowerBound <= number && number < upperBound;
        case '()': return lowerBound < number && number < upperBound;
        case '(]': return lowerBound < number && number <= upperBound;
        case '[]': return lowerBound <= number && number <= upperBound;
        default: throw new Error(`Unknown endpoint type: ${endpointType}`);
    }
}

export function parseCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (!commandMatch) return 'Command is incorrectly formatted';

    const commandName = '!' + commandMatch[1];
    let args = commandMatch[2] ? commandMatch[2].match(argRegex) : [];

    const command = getCommand(commandName);
    if (!command) return `${commandName} is not a command.`;

    const params = commandParams(command);
    const paramNames = commandParamNames(command);
    if (args.length !== params.length)
        return `Command ${command.name} was given ${args.length} args, but requires ${params.length} args.`;

    for (let i = 0; i < args.length; i++) {
        const param = params[i];
        let arg = args[i].trim();
        if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
            arg = arg.substring(1, arg.length - 1);
        }

        if (commandName === '!placeHere' && param.type === 'BlockOrItemName') {
            arg = normalizePlacementItemName(arg);
        }

        switch(param.type) {
            case 'int':
                arg = Number.parseInt(arg);
                break;
            case 'float':
                arg = Number.parseFloat(arg);
                break;
            case 'boolean':
                arg = parseBoolean(arg);
                break;
            case 'BlockName':
            case 'BlockOrItemName':
            case 'ItemName':
                if (arg.endsWith('plank') || arg.endsWith('seed'))
                    arg += 's';
                break;
            case 'string':
                break;
            default:
                throw new Error(`Command '${commandName}' parameter '${paramNames[i]}' has an unknown type: ${param.type}`);
        }
        if (arg === null || Number.isNaN(arg))
            return `Error: Param '${paramNames[i]}' must be of type ${param.type}.`;

        if (typeof arg === 'number') {
            const domain = param.domain;
            if (domain) {
                const endpointType = domain[2] || '[)';
                if (!checkInInterval(arg, domain[0], domain[1], endpointType)) {
                    return `Error: Param '${paramNames[i]}' must be an element of ${endpointType[0]}${domain[0]}, ${domain[1]}${endpointType[1]}.`;
                }
            } else if (!suppressNoDomainWarning) {
                console.warn(`Command '${commandName}' parameter '${paramNames[i]}' has no domain set. Expect any value [-Infinity, Infinity].`);
                suppressNoDomainWarning = true;
            }
        } else if (param.type === 'BlockName') {
            if (getBlockId(arg) == null) return `Invalid block type: ${arg}.`;
        } else if (param.type === 'ItemName') {
            if (getItemId(arg) == null) return `Invalid item type: ${arg}.`;
        } else if (param.type === 'BlockOrItemName') {
            if (getBlockId(arg) == null && getItemId(arg) == null) return `Invalid block or item type: ${arg}.`;
        }
        args[i] = arg;
    }

    return { commandName, args };
}

export function truncCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch) {
        return message.substring(0, commandMatch.index + commandMatch[0].length);
    }
    return message;
}

export function isAction(name) {
    return actionsList.find(action => action.name === name) !== undefined;
}

function commandParams(command) {
    if (!command.params)
        return [];
    return Object.values(command.params);
}

function commandParamNames(command) {
    if (!command.params)
        return [];
    return Object.keys(command.params);
}

function numParams(command) {
    return commandParams(command).length;
}

export async function executeCommand(agent, message) {
    const parsed = parseCommandMessage(message);
    if (typeof parsed === 'string')
        return parsed;

    console.log('parsed command:', parsed);
    const command = getCommand(parsed.commandName);
    const numArgs = parsed.args?.length || 0;
    if (numArgs !== numParams(command))
        return `Command ${command.name} was given ${numArgs} args, but requires ${numParams(command)} args.`;
    return command.perform(agent, ...parsed.args);
}

export function getCommandDocs(agent) {
    const typeTranslations = {
        float: 'number',
        int: 'number',
        BlockName: 'string',
        ItemName: 'string',
        BlockOrItemName: 'string',
        boolean: 'bool'
    };
    let docs = `\n*COMMAND DOCS\n You can use the following commands to perform actions and get information about the world. \n    Use the commands with the syntax: !commandName or !commandName("arg1", 1.2, ...) if the command takes arguments.\n\n    Do not use codeblocks. Use double quotes for strings. Only use one command in each response, trailing commands and comments will be ignored.\n`;
    for (const command of commandList) {
        if (agent.blocked_actions.includes(command.name)) {
            continue;
        }
        docs += command.name + ': ' + command.description + '\n';
        if (command.params) {
            docs += 'Params:\n';
            for (const param in command.params) {
                docs += `${param}: (${typeTranslations[command.params[param].type] ?? command.params[param].type}) ${command.params[param].description}\n`;
            }
        }
    }
    return docs + '*\n';
}

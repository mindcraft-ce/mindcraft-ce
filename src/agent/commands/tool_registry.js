// Native tool calls share develop's commands, validation rules and action manager.
import { getCommands, isAction } from './index.js';
import { getBlockId, getItemId } from '../../utils/mcdata.js';
import settings from '../settings.js';
import PlaceBlockAt from './tools/placeBlockAt.js';
import ExecuteCode from './tools/executeCode.js';
import GenerateAugment from './tools/generateAugment.js';
import SearchSkills from './tools/searchSkills.js';
import { getAugmentRegistry } from '../agents/code.js';

const extras = [new PlaceBlockAt(), new ExecuteCode(), new GenerateAugment(), new SearchSkills()];
const codeTools = new Set(['newAction', 'executeCode', 'generateAugment']);
const unblockable = new Set(['stop', 'stats', 'inventory', 'goal']);
const types = { int: 'integer', float: 'number', BlockName: 'string', ItemName: 'string', BlockOrItemName: 'string' };

function enabled(agent, name) {
    if (codeTools.has(name) && !settings.allow_insecure_coding) return false;
    return unblockable.has(name) || !(agent?.blocked_actions || settings.blocked_actions || [])
        .some(blocked => blocked.replace(/^!/, '') === name);
}

function availableTools(agent) {
    const tools = new Map();
    for (const command of getCommands()) {
        const name = command.name.slice(1);
        if (!enabled(agent, name)) continue;
        const properties = Object.fromEntries(Object.entries(command.params || {}).map(([key, param]) => [key, {
            type: types[param.type] || param.type, description: param.description,
        }]));
        tools.set(name, {
            name, description: command.description, is_action: isAction(command.name),
            parameters: { type: 'object', properties, required: Object.keys(properties).filter(key => !command.params[key].optional), additionalProperties: false },
            command,
            execute: (...args) => (command.perform.structured || command.perform)(...args),
        });
    }
    for (const tool of [...extras, ...getAugmentRegistry(agent).values()]) {
        if (!enabled(agent, tool.name) || tools.has(tool.name)) continue;
        if (!extras.includes(tool) && !settings.allow_insecure_coding) continue;
        const properties = Object.fromEntries(tool.parameters.map(param => [param.name, {
            type: param.type, description: param.description,
        }]));
        tools.set(tool.name, {
            name: tool.name, description: tool.description, is_action: tool.is_action,
            parameters: { type: 'object', properties, required: tool.parameters.filter(p => p.is_required).map(p => p.name), additionalProperties: false },
            execute: (...args) => tool.execute(...args),
        });
    }
    return tools;
}

export function getToolDefinitions(agent) {
    return [...availableTools(agent).values()].map(({ name, description, parameters }) => ({
        type: 'function', function: { name, description, parameters },
    }));
}

export function getToolDocs(agent) {
    return JSON.stringify(getToolDefinitions(agent), null, 2);
}

export function isToolAction(agent, name) {
    return availableTools(agent).get(name.replace(/^!/, ''))?.is_action || false;
}

export async function executeTool(agent, name, args = {}) {
    const tool = availableTools(agent).get(name.replace(/^!/, ''));
    if (!tool) throw new Error(`Tool ${name} not found or disabled`);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object');
    const schema = tool.parameters;
    for (const key of Object.keys(args)) {
        if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown argument: ${key}`);
    }
    const values = [];
    for (const [key, prop] of Object.entries(schema.properties)) {
        let value = args[key];
        if (value === undefined && !schema.required.includes(key)) { values.push(undefined); continue; }
        const valid = prop.type === 'integer' ? Number.isSafeInteger(value)
            : prop.type === 'number' ? typeof value === 'number' && Number.isFinite(value)
            : typeof value === prop.type;
        if (!valid) throw new Error(`Param '${key}' must be of type ${prop.type}`);
        const original = tool.command?.params?.[key];
        if (original?.domain) {
            const [min, max, interval = '[)'] = original.domain;
            if ((interval[0] === '[' ? value < min : value <= min) || (interval[1] === ']' ? value > max : value >= max))
                throw new Error(`Param '${key}' is outside its allowed range`);
        }
        if (['BlockName', 'ItemName', 'BlockOrItemName'].includes(original?.type)) {
            if (value.endsWith('plank') || value.endsWith('seed')) value += 's';
            const block = original.type !== 'ItemName' && getBlockId(value) != null;
            const item = original.type !== 'BlockName' && getItemId(value) != null;
            if (!block && !item) throw new Error(`Invalid block or item type: ${value}`);
        }
        values.push(value);
    }
    if (tool.name === 'stop') agent.agentSystem?.cancelTask();
    if (tool.name === 'help') return 'Available native tools (use function calls; requestTools can grant available actions):\n' + getToolDocs(agent);
    return await tool.execute(agent, ...values);
}

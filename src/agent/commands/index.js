import { tools } from './actions.js';

const toolMap = {};
const toolList = [];

initializeTools();

export async function initializeTools() {
    const loadedTools = await tools();
    for (const tool of Object.values(loadedTools)) {
        toolMap[tool.name] = tool;
        toolList.push(tool);
    }
}

export function getTool(name) {
    if (name.startsWith('!')) {
        name = name.slice(1);
    }
    return toolMap[name];
}

export function getToolDefinitions() {
    return toolList.map(tool => {
        return convertToolToSchema(tool);
    });
}

function convertParameterToSchema(params) {
    if (!params) return { type: 'object', properties: {} };
    
    // If it's already a schema object (has 'type' and 'properties')
    if (params.type === 'object' && params.properties) {
        return params;
    }

    // If it's an array of CommandProperty objects
    if (Array.isArray(params)) {
        const schema = {
            type: 'object',
            properties: {},
            required: []
        };

        for (const prop of params) {
            schema.properties[prop.name] = {
                type: prop.type,
                description: prop.description
            };
            if (prop.is_required) {
                schema.required.push(prop.name);
            }
        }
        return schema;
    }

    // Fallback
    return { type: 'object', properties: {} };
}
/*
function convertToolToSchema(tool) {
    return {
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: convertParameterToSchema(tool.parameters)
        }
    };
}
*/


function convertToolToSchema(tool) {
    // Responses API expects flat shape (vs Chat Completions' nested {function: {...}}).
    return {
        "type": "function",
        "name": tool.name,
        "description": tool.description,
        "parameters": convertParameterToSchema(tool.parameters),
        "strict": false
    }
}

export async function executeTool(agent, name, args) {

    if(toolList.length === 0) {
        await initializeTools();
    }

    if (name.startsWith('!')) {
        name = name.slice(1);
    }
    const tool = toolMap[name];
    if (!tool) {
        console.error('the list of tools are:', Object.keys(toolMap));
        console.error("tool list is:", toolList);
        throw new Error(`Tool ${name} not found`);
    }
    
    // if the args is a array, map them to positional arguments
    if (Array.isArray(args)) {
        return await tool.execute(agent, ...args);
    }

    const positionalArgs = mapArgs(tool.parameters, args);
    return await tool.execute(agent, ...positionalArgs);
}

function mapArgs(params, argsObj) {
    if (!params) return [];
    if (!argsObj) return [];

    // If params is array of CommandProperty, we can enforce order
    if (Array.isArray(params)) {
        return params.map(prop => argsObj[prop.name]);
    }

    if (params.properties) {
        return Object.keys(params.properties).map(key => argsObj[key]);
    }

    return [];
}

export function blacklistTools(toolNames) {
    const unblockable = ['stop', 'stats', 'inventory', 'goal'];
    for (const name of toolNames) {
        if (unblockable.includes(name)) {
            console.warn(`Tool ${name} is unblockable`);
            continue;
        }
        delete toolMap[name];
        const index = toolList.findIndex(t => t.name === name);
        if (index !== -1) {
            toolList.splice(index, 1);
        }
    }
}

export function containsToolCall(message) {
    for (const toolName of Object.keys(toolMap)) {
        if (message.includes(`!${toolName}`)) {
            return toolName;
        }
    }
    return null; 
}

export function isTool(name) {
    return toolMap[name] !== undefined;
}

export function isAction(name) {
    // check if the tool is an action or a query tool
    return toolMap[name] ? toolMap[name].is_action : false;
}


export function getToolDocs() {
    // generate a string documenting all tools
    let docs = "Available Tools:\n";
    for (const tool of toolList) {
        docs += `\n${tool.name}: ${tool.description}\nParameters:\n`;
        if (Array.isArray(tool.parameters)) {
            for (const param of tool.parameters) {
                docs += ` - ${param.name} (${param.type})${param.is_required ? ' [required]' : ''}: ${param.description}\n`;
            }
        } else if (tool.parameters && tool.parameters.properties) {
            for (const [key, value] of Object.entries(tool.parameters.properties)) {
                docs += ` - ${key} (${value.type}): ${value.description}\n`;
            }
        } else {
            docs += " - None\n";
        }
    }
    return docs;
}


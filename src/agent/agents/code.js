import { readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { codeAgentResponseFormat } from './responseFormat.js';
import settings from '../settings.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('CodeAgent');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const augmentsPath = path.join(__dirname, '..', 'commands', 'tools', 'augments');

const augmentRegistry = new Map();

export function getAugment(name) {
    return augmentRegistry.get(name);
}

export function getAugmentRegistry() {
    return augmentRegistry;
}

export function listAugments() {
    return Array.from(augmentRegistry.entries()).map(([name, tool]) => ({
        name,
        description: tool.description,
        parameters: tool.parameters
    }));
}

let codeAgentPromptTemplate = '';
try {
    codeAgentPromptTemplate = readFileSync('./profiles/defaults/tools/code_agent.xml', 'utf8');
} catch (e) {
    log.warn('Could not load code_agent.xml:', e.message);
}

export class CodeAgent {
    constructor(agent) {
        this.agent = agent;
        this.maxAttempts = 3;
    }

    async generateAugment(spec) {
        const { augment_name, description, parameters, task_context } = spec;
        log.info(`Generating augment: ${augment_name}`);

        for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
            if (this.agent.bot.interrupt_code) {
                log.info('Interrupted.');
                return null;
            }

            log.info(`Attempt ${attempt}/${this.maxAttempts}`);

            let response;
            try {
                const messages = await this._buildMessages(spec);
                const model = this.agent.prompter.code_model || this.agent.prompter.chat_model;
                const [generation] = await model.sendRequest(
                    messages, null, null, codeAgentResponseFormat
                );
                response = this._parseResponse(generation);
            } catch (error) {
                log.error(`LLM call failed (attempt ${attempt}):`, error.message);
                continue;
            }

            if (!response?.is_complete || !response.function_body) {
                log.warn(`Incomplete response: ${response?.error_analysis || 'unknown'}`);
                continue;
            }

            const source = this._buildAugmentFile(
                augment_name, description, parameters, response.function_body
            );

            try {
                const tool = await this._saveAndRegister(augment_name, source);
                log.info(`Generated augment: ${augment_name}`);
                return tool;
            } catch (error) {
                log.error(`Save failed (attempt ${attempt}):`, error.message);
                continue;
            }
        }

        log.error(`Failed to generate ${augment_name} after ${this.maxAttempts} attempts.`);
        return null;
    }

    async _buildMessages(spec) {
        const { augment_name, description, parameters, task_context, _lastError } = spec;

        let systemPrompt = codeAgentPromptTemplate;

        if (systemPrompt.includes('$CODE_DOCS') && this.agent.prompter?.skill_libary) {
            const codeDocs = await this.agent.prompter.skill_libary.getRelevantSkillDocs(
                task_context, settings.relevant_docs_count
            );
            systemPrompt = systemPrompt.replace('$CODE_DOCS', codeDocs);
        }

        const paramDescriptions = parameters.map(p =>
            `  - ${p.name} (${p.type})${p.required ? ' [required]' : ''}: ${p.description}`
        ).join('\n');

        let userContent = `Generate an augment tool function body for:\n\n` +
            `Name: ${augment_name}\nDescription: ${description}\n` +
            `Parameters:\n${paramDescriptions}\n\nTask context: ${task_context}`;

        if (_lastError)
            userContent += `\n\nPREVIOUS ATTEMPT FAILED:\n${_lastError}\nPlease fix and try again.`;

        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
        ];
    }

    _buildAugmentFile(name, description, parameters, functionBody) {
        const className = name.charAt(0).toUpperCase() + name.slice(1) + 'Tool';

        const paramConstructors = parameters.map(p =>
            `            new CommandProperty("${p.name}", "${p.description.replace(/"/g, '\\"')}", "${p.type}", ${!!p.required})`
        ).join(',\n');

        const paramNames = parameters.map(p => p.name).join(', ');
        const argsObj = parameters.map(p => p.name).join(', ');

        return `import BaseTool from "../../base_tool.js";
import CommandProperty from "../../property.js";
import * as skills from "../../../library/skills.js";
import * as world from "../../../library/world.js";
import { Vec3 } from "vec3";

class ${className} extends BaseTool {
    constructor() {
        super("${name}", "${description.replace(/"/g, '\\"')}", [
${paramConstructors}
        ]);
    }

    async execute(agent, ${paramNames}) {
        const bot = agent.bot;
        const args = { ${argsObj} };
        const log = skills.log;
        const actionFn = async () => {
${functionBody.split('\n').map(line => '            ' + line).join('\n')}
        };
        const code_return = await agent.actions.runAction('action:${name}', actionFn, { timeout: ${settings.code_timeout_mins} });
        return code_return.message;
    }
}

export default ${className};
`;
    }

    async _saveAndRegister(fileName, source) {
        await mkdir(augmentsPath, { recursive: true });

        const filePath = path.join(augmentsPath, `${fileName}.js`);
        await writeFile(filePath, source, 'utf8');
        log.info(`Saved to ${filePath}`);

        const fileUrl = pathToFileURL(filePath).href;
        const module = await import(`${fileUrl}?t=${Date.now()}`);
        const ToolClass = module.default;

        if (!ToolClass || typeof ToolClass !== 'function')
            throw new Error(`${fileName}.js did not export a valid class`);

        const toolInstance = new ToolClass();
        augmentRegistry.set(toolInstance.name, toolInstance);
        log.info(`Registered augment: ${toolInstance.name}`);
        return toolInstance;
    }

    _parseResponse(response) {
        let clean = response.trim();
        if (clean.startsWith('```json')) clean = clean.slice(7);
        else if (clean.startsWith('```')) clean = clean.slice(3);
        if (clean.endsWith('```')) clean = clean.slice(0, -3);
        return JSON.parse(clean.trim());
    }
}

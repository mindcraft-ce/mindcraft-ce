// Separate from sendRequest: develop's text, vision and embedding contracts stay intact.
import { randomUUID } from 'node:crypto';

const defaults = {
    openai: 'gpt-5.4-mini', anthropic: 'claude-sonnet-4-6', google: 'gemini-2.5-flash',
    groq: 'openai/gpt-oss-120b', cerebras: 'gpt-oss-120b', ollama: 'sweaterdog/andy-4:micro-q8_0',
    ollama_cloud: 'gpt-oss:120b', andy: 'auto', mistral: 'mistral-large-latest', lmstudio: 'andy-4.1',
    deepseek: 'deepseek-chat', qwen: 'qwen-plus', grok: 'grok-4.1-fast-non-reasoning', mercury: 'mercury-coder-small',
    novita: 'meta-llama/llama-4-scout-17b-16e-instruct', vllm: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
};

export function normalizeToolResponse(text, calls = []) {
    if (text != null && typeof text !== 'string') throw new Error('Provider returned non-text completion content');
    if (!Array.isArray(calls)) throw new Error('Provider returned an invalid tool call list');
    const normalized = calls.map(call => ({
        ...call, id: call.id || randomUUID(), name: call.name || call.function?.name,
        arguments: typeof (call.arguments ?? call.function?.arguments) === 'string'
            ? JSON.parse(call.arguments ?? call.function.arguments)
            : (call.arguments ?? call.function?.arguments ?? call.args ?? {}),
    }));
    const ids = new Set();
    for (const call of normalized) {
        if (typeof call.name !== 'string' || !call.name.trim() || typeof call.id !== 'string' ||
            !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments))
            throw new Error('Provider returned a malformed tool call');
        if (ids.has(call.id)) throw new Error('Provider returned duplicate tool call IDs');
        ids.add(call.id);
    }
    if (!text?.trim() && !normalized.length) throw new Error('Provider returned an empty completion');
    return [text || '', normalized];
}

export function toolCallMessage(text, calls) {
    const message = { role: 'assistant', content: text || '' };
    if (calls.length) message.tool_calls = calls.map(call => ({
        id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) },
    }));
    if (calls[0]?.provider_content) message.provider_content = calls[0].provider_content;
    return message;
}

function schemaInstructions(system, format) {
    return format ? `${system || ''}\nRespond with JSON matching this schema:\n${JSON.stringify(format.json_schema?.schema || format)}` : system;
}

export function supportsNativeTools(provider) {
    return Boolean(provider.anthropic || provider.genAI || provider.openai?.chat?.completions || provider.groq?.chat?.completions ||
        provider.vllm?.chat?.completions || provider.client?.chat?.completions || provider.huggingface?.chatCompletion ||
        ['ollama','ollama_cloud','andy'].includes(provider.constructor.prefix) || typeof provider.sendToolRequest === 'function');
}

export async function sendToolRequest(provider, turns, systemMessage, tools = [], responseFormat = null, {signal, role} = {}) {
    const model = provider.model_name || defaults[provider.constructor.prefix];
    if (!model) throw new Error('Select an explicit model for native tool calling');
    const params = { ...(provider.params || {}) };
    // The experimental path owns its tools, structured messages and non-streaming response.
    for (const key of ['tools', 'tool_choice', 'messages', 'stream', 'response_format', 'stop']) delete params[key];
    const history = structuredClone(turns);
    if (provider.anthropic) {
        const messages = history.filter(t => t.role !== 'system').map(turn => {
            if (turn.role === 'tool') return { role: 'user', content: [{ type: 'tool_result', tool_use_id: turn.tool_call_id, content: turn.content }] };
            if (turn.provider_content) return { role: 'assistant', content: turn.provider_content };
            if (turn.tool_calls) return { role: 'assistant', content: [
                ...(turn.content ? [{ type: 'text', text: turn.content }] : []),
                ...turn.tool_calls.map(call => ({ type: 'tool_use', id: call.id, name: call.function.name, input: JSON.parse(call.function.arguments) })),
            ] };
            return turn;
        });
        if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '_' });
        const response = await provider.anthropic.messages.create({
            ...params, model, max_tokens: params.max_tokens || ((params.thinking?.budget_tokens || 3096) + 1000),
            system: schemaInstructions([systemMessage, ...history.filter(t => t.role === 'system').map(t => t.content)].filter(Boolean).join('\n'), responseFormat),
            messages, ...(tools.length ? { tools: tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })) } : {}),
        }, {signal});
        if (response.stop_reason === 'max_tokens') throw new Error('Tool response was truncated; increase the output token limit');
        if (!Array.isArray(response.content)) throw new Error('Provider returned no completion');
        return normalizeToolResponse(response.content.filter(c => c.type === 'text').map(c => c.text).join('\n'),
            response.content.filter(c => c.type === 'tool_use').map(c => ({ id: c.id, name: c.name, arguments: c.input, provider_content: response.content })));
    }
    if (provider.genAI) {
        const contents = history.filter(t => t.role !== 'system').map(turn => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: turn.provider_content || (turn.role === 'tool'
                ? [{ functionResponse: { name: turn.name, response: { result: turn.content } } }]
                : [...(turn.content ? [{ text: turn.content }] : []), ...(turn.tool_calls || []).map(call => ({ functionCall: { name: call.function.name, args: JSON.parse(call.function.arguments) } }))]),
        }));
        const response = await provider.genAI.models.generateContent({ model, contents, config: {
            ...params, abortSignal: signal,
            systemInstruction: schemaInstructions([systemMessage, ...history.filter(t => t.role === 'system').map(t => t.content)].filter(Boolean).join('\n'), responseFormat),
            ...(tools.length ? { tools: [{ functionDeclarations: tools.map(t => ({ name: t.function.name, description: t.function.description, parametersJsonSchema: t.function.parameters })) }] } : {}),
        } });
        const reason = response.candidates?.[0]?.finishReason;
        if (reason === 'MAX_TOKENS') throw new Error('Tool response was truncated; increase the output token limit');
        if (response.promptFeedback?.blockReason || (reason && !['STOP','FINISH_REASON_UNSPECIFIED'].includes(reason)))
            throw new Error(`Provider blocked completion: ${response.promptFeedback?.blockReason || reason}`);
        return normalizeToolResponse(response.text, (response.functionCalls || []).map(call => ({ ...call, provider_content: response.candidates?.[0]?.content?.parts })));
    }
    const messages = [...(systemMessage ? [{ role: 'system', content: systemMessage }] : []), ...history];
    const pack = { ...params, model, messages, stream: false, ...(tools.length ? { tools } : {}),
        ...(responseFormat ? { response_format: { ...responseFormat, json_schema: { ...responseFormat.json_schema, strict: false } } } : {}),
    };
    if (provider.constructor.prefix === 'ollama' || provider.constructor.prefix === 'ollama_cloud') {
        const response = await provider.send(provider.chat_endpoint, { ...pack, messages: messages.map(turn => {
            if (!turn.tool_calls) return turn;
            return { ...turn, tool_calls: turn.tool_calls.map(call => ({ ...call, function: { ...call.function, arguments: JSON.parse(call.function.arguments) } })) };
        }), ...(responseFormat ? { format: responseFormat.json_schema.schema } : {}) }, {signal});
        if (!response.message) throw new Error(`Provider returned no completion${response.error ? `: ${response.error}` : ''}`);
        if (response.done_reason === 'length') throw new Error('Tool response was truncated; increase the output token limit');
        return normalizeToolResponse(response.message.content, response.message.tool_calls);
    }
    let response;
    const client = provider.openai || provider.groq || provider.vllm || provider.client;
    if (client?.chat?.completions?.create) response = await client.chat.completions.create(pack, {signal});
    else if (provider.constructor.prefix === 'andy') response = await provider.send(provider.chat_endpoint, pack, {signal});
    else if (provider.huggingface?.chatCompletion) response = await provider.huggingface.chatCompletion(pack, {signal});
    else if (typeof provider.sendToolRequest === 'function') {
        const [text,calls] = await provider.sendToolRequest(history, systemMessage, tools, responseFormat, {signal,role});
        return normalizeToolResponse(text,calls);
    }
    else throw new Error(`Native tool calling is not supported for provider '${provider.constructor.prefix}'. Disable use_function_calling or select a supported provider.`);
    const choice = response.choices?.[0];
    if (!choice?.message) throw new Error('Provider returned no completion');
    if (choice.finish_reason === 'length') throw new Error('Tool response was truncated; increase the output token limit');
    if (choice.message.refusal) throw new Error(`Provider declined completion: ${choice.message.refusal}`);
    return normalizeToolResponse(choice.message.content, choice.message.tool_calls);
}

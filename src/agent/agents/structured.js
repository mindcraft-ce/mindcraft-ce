export function parseObject(text) {
    if (typeof text !== 'string') return null;
    const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
        const value = JSON.parse(clean);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch { return null; }
}

export function chatText(text) {
    const parsed = parseObject(text);
    if (parsed) return typeof parsed.chat_response === 'string' ? parsed.chat_response : '';
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

export const functionTool = (name, description, properties = {}, required = Object.keys(properties)) => ({
    type:'function', function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}},
});

export function validateArguments(definition,args) {
    const schema=definition.function.parameters;
    if(!args||typeof args!=='object'||Array.isArray(args)) throw new Error('Tool arguments must be an object');
    for(const key of schema.required||[]) if(args[key]===undefined) throw new Error(`Missing argument '${key}'`);
    for(const [key,value] of Object.entries(args)) {
        const p=schema.properties[key];if(!p) throw new Error(`Unknown argument '${key}'`);
        const valid=p.type==='integer'?Number.isSafeInteger(value):p.type==='number'?Number.isFinite(value):
            p.type==='array'?Array.isArray(value)&&value.every(v=>typeof v===p.items.type):typeof value===p.type;
        if(!valid) throw new Error(`Argument '${key}' must be ${p.type}`);
    }
}

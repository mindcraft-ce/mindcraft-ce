// Tool diagnostics remain in history/logs. Only deliberately phrased messages
// cross into player chat; a successful promise is not a narration sentence.
const technical = /(?:\b(?:pathfinder|non-destructive path|destructive movements|tool[_ -]?calls?|function calls?|tool[- ]call budget|step budget|requestTools|taskDone|taskBlocked|placeBlockAt|placeHere|collectBlocks|goToCoordinates|stack trace|ECONN\w*|HTTP\s*\d{3})\b|\b[a-z]+_[a-z_]+\b|\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)|\bx:\s*-?\d|\by:\s*-?\d|\bz:\s*-?\d)/i;

export function playerNarration(text) {
    return typeof text === 'string' && !technical.test(text) ? text.trim() : '';
}

const label = name => String(name || 'blocks').replace(/^minecraft:/, '').replaceAll('_', ' ');
const resource = call => {
    const name = call?.arguments?.type || 'blocks';
    if (/(?:_log|_wood)$/.test(name)) return 'wood';
    return label(name);
};
const placement = call => ['placeHere', 'placeBlockAt'].includes(call?.name);
const torch = call => /torch/.test(call?.arguments?.type || '');
const movement = call => ['goToCoordinates','goToPlayer','goToRememberedPlace','moveAway','searchForBlock','searchForEntity','followPlayer'].includes(call?.name);

export function actionMessage(call, {complete = false, result} = {}) {
    const name = call?.name;
    if (placement(call)) return torch(call)
        ? complete ? 'That spot is lit.' : "I'm lighting the area."
        : complete ? 'That block is in place.' : "I'm adding the next blocks.";
    if (name === 'collectBlocks') return complete && result?.status === 'partial'
        ? `I've made some progress gathering ${resource(call)}.` : `I'm gathering ${resource(call)}.`;
    if (movement(call)) return complete ? "I've reached the next spot." : "I'm heading to the next spot.";
    const messages = {
        craftRecipe: call?.arguments?.recipe_name === 'crafting_table' ? "I'm making a crafting table." : "I'm crafting what we need.",
        smeltItem: "I'm waiting for the furnace to finish.",
        inventory: "I'm checking my supplies.", stats: "I'm checking how things look.",
        nearbyBlocks: "I'm looking around.", entities: "I'm checking what's nearby.",
        searchWiki: "I'm checking how to do this.", searchSkills: "I'm working out the next step.",
        help: "I'm working out the next step.", craftable: "I'm checking what I can make.",
        givePlayer: "I'm bringing you the items.", equip: "I'm getting the right equipment ready.",
        consume: "I'm having something to eat.", putInChest: "I'm putting the items away.",
        takeFromChest: "I'm getting the items from the chest.", viewChest: "I'm checking the chest.",
        goToBed: "I'm heading to bed.", stay: "I'm staying here.", stop: "I'm stopping.",
        attack: "I'm going after the target.", attackPlayer: "I'm going after the player you named.",
        clearFurnace: "I'm collecting what's in the furnace.", discard: "I'm clearing some space in my inventory.",
    };
    return messages[name] || "I'm working on the next step.";
}

export function problemMessage(result = {}, call) {
    const explicit = playerNarration(result.user_message);
    if (explicit) return explicit;
    if (String(result.code || '').startsWith('budget_')) return "I've reached my usage limit and need to pause.";
    if (result.code === 'missing_tool' || /missing the required tool|right tools to harvest/i.test(result.blocker || result.text || ''))
        return 'I need a suitable tool before I can mine that.';
    if (result.code === 'inventory_full' || /inventory full/i.test(result.text || ''))
        return 'My inventory is full. I need to make some room.';
    if (placement(call)) {
        if (result.code === 'missing_item' || /don't have any|do not have/i.test(result.text || ''))
            return torch(call) ? "I'm out of torches." : "I don't have the blocks I need.";
        return torch(call) ? "I couldn't put a torch in that spot." : "I couldn't place a block in that spot.";
    }
    if (movement(call)) return "I couldn't reach that spot.";
    if (call?.name === 'collectBlocks') return /no reachable|not found|no .* nearby/i.test(result.blocker || result.text || '')
        ? `I couldn't find more ${resource(call)} nearby.` : `I'm having trouble gathering ${resource(call)}.`;
    if (call?.name === 'craftRecipe') return "I couldn't finish crafting that yet.";
    if (call?.name === 'smeltItem') return "I couldn't finish smelting that yet.";
    return "I couldn't finish that step.";
}

export function responseProblem(error) {
    return String(error?.code || '').startsWith('budget_') ? problemMessage(error)
        : "I'm having trouble working out the next step. Please try again shortly.";
}

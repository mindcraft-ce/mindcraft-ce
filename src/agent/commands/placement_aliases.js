const PLACEMENT_ITEM_ALIASES = Object.freeze({
    tripwire: 'string',
    potatoes: 'potato',
    wheat: 'wheat_seeds',
});

export function normalizePlacementItemName(name) {
    return PLACEMENT_ITEM_ALIASES[name] ?? name;
}

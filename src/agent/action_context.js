import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
export function actionContext(bot) {
    const owner = context.getStore();
    return owner?.bot === bot ? owner : null;
}
export function assertActionOwner(bot) {
    const owner = actionContext(bot);
    if (owner?.signal.aborted) throw owner.signal.reason || new Error('Action cancelled');
}
export const withAction = (owner, fn) => context.run(owner, fn);
export const withoutAction = fn => context.exit(fn);
export function onActionCleanup(bot, fn) {
    const callbacks = actionContext(bot)?.cleanups;
    callbacks?.add(fn);
    return () => callbacks?.delete(fn);
}
export function releaseAction(owner) {
    for (const cleanup of owner.cleanups || []) {
        try { withoutAction(cleanup); } catch (error) { console.warn('Action cleanup:', error.message); }
    }
    owner.cleanups?.clear();
}

// A cancelled action may finish an awaited operation later. It must never start
// another operation after a newer action has taken ownership of the bot.
export function guardBotActions(bot) {
    let interrupt = Boolean(bot.interrupt_code);
    Object.defineProperty(bot, 'interrupt_code', {configurable:true,
        get() { return interrupt || Boolean(actionContext(bot)?.signal.aborted); },
        set(value) { if (!actionContext(bot)?.signal.aborted) interrupt = Boolean(value); },
    });
    for (const name of ['dig', 'equip', 'placeBlock', 'activateBlock', 'lookAt', 'toss', 'tossStack',
        'craft','openFurnace','openChest','openContainer','clickWindow','closeWindow','transfer','consume','fish','sleep']) {
        const original = bot[name];
        if (typeof original !== 'function') continue;
        bot[name] = async function (...args) {
            assertActionOwner(bot);
            if (name === 'dig') bot.emit('action_dig_target', args[0]);
            return await original.apply(this, args);
        };
    }
    for (const [object, name] of [[bot, 'setControlState'], [bot.pathfinder, 'setGoal'], [bot.pathfinder, 'setMovements'],
        ...['chat','attack','activateItem','activateEntity','setQuickBarSlot'].map(name => [bot,name])]) {
        const original = object?.[name];
        if (!original) continue;
        object[name] = function (...args) {
            if (actionContext(bot)?.signal.aborted) return;
            return original.apply(this, args);
        };
    }
    const goto = bot.pathfinder?.goto;
    if (goto) bot.pathfinder.goto = async function (...args) {
        assertActionOwner(bot);
        return await goto.apply(this, args);
    };
}

export async function cancellable(bot, operation, timeoutMs, cleanup = () => {}) {
    assertActionOwner(bot);
    const signal = actionContext(bot)?.signal;
    let timer, abort;
    try {
        return await Promise.race([
            Promise.resolve().then(operation),
            new Promise((_, reject) => {
                abort = () => { withoutAction(cleanup); reject(signal.reason || new Error('Action cancelled')); };
                signal?.addEventListener('abort', abort, {once: true});
                if (signal?.aborted) abort();
                if (timeoutMs > 0) timer = setTimeout(() => {
                    cleanup();
                    reject(Object.assign(new Error(`Operation made no progress within ${timeoutMs} ms`), {code: 'timeout'}));
                }, timeoutMs);
            }),
        ]);
    } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
    }
}

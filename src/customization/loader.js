/**
 * Customization Loader
 *
 * Loads a server-specific customization module if configured in settings.js.
 * If no customization is set, returns a default (no-op) ServerCustomization
 * so core code works out of the box without any server-specific behavior.
 *
 * Usage in settings.js:
 *   "customization": "./my_server"  // loads ./my_server/index.js
 *   "customization": ""             // no customization, use defaults
 *
 * The customization module must export a default class that extends ServerCustomization.
 */

import { ServerCustomization } from './base.js';
import settings from '../agent/settings.js';

let _instance = null;

/**
 * Load and return the customization singleton.
 * First call loads from disk; subsequent calls return the cached instance.
 * @returns {ServerCustomization} — the loaded customization or a default no-op instance
 */
export async function getCustomization() {
    if (_instance) return _instance;

    const customPath = settings.customization;

    if (customPath) {
        try {
            // Resolve relative to project root
            const modulePath = `../../${customPath}/index.js`;
            const module = await import(modulePath);
            const CustomClass = module.default;

            if (CustomClass && CustomClass.prototype instanceof ServerCustomization) {
                _instance = new CustomClass(settings);
                // Print customization info in cyan at startup
                const cyan = '\x1b[36m';
                const reset = '\x1b[0m';
                console.log(`${cyan}╔══════════════════════════════════════╗${reset}`);
                console.log(`${cyan}║  Server Customization: ${_instance.name.padEnd(13)}║${reset}`);
                console.log(`${cyan}╠══════════════════════════════════════╣${reset}`);
                const features = [];
                if (_instance.onBotCreated !== ServerCustomization.prototype.onBotCreated) features.push('Bot patches');
                if (_instance.onAgentInit !== ServerCustomization.prototype.onAgentInit) features.push('Agent init');
                if (_instance.getBotOptions !== ServerCustomization.prototype.getBotOptions) features.push('Auth handler');
                if (_instance.shouldIgnoreMessage !== ServerCustomization.prototype.shouldIgnoreMessage) features.push('Nickname filter');
                if (_instance.routeChat !== ServerCustomization.prototype.routeChat) features.push('Chat routing');
                if (_instance.isEchoBack !== ServerCustomization.prototype.isEchoBack) features.push('Echo-back filter');
                if (_instance.getExtraCommands !== ServerCustomization.prototype.getExtraCommands) features.push('Custom commands');
                if (_instance.expandPromptVars !== ServerCustomization.prototype.expandPromptVars) features.push('Prompt variables');
                features.forEach(f => console.log(`${cyan}║  ✓ ${f.padEnd(33)}║${reset}`));
                console.log(`${cyan}╚══════════════════════════════════════╝${reset}`);
            } else if (CustomClass) {
                // Class exists but doesn't extend base — try to use it anyway
                _instance = new CustomClass(settings);
                console.warn(`[Customization] Loaded "${customPath}" but it doesn't extend ServerCustomization. Some hooks may not work.`);
            } else {
                console.warn(`[Customization] No default export found in ${customPath}/index.js. Using defaults.`);
                _instance = new ServerCustomization(settings);
            }
        } catch (err) {
            console.error(`[Customization] Failed to load "${customPath}":`, err.message);
            console.log('[Customization] Falling back to defaults.');
            _instance = new ServerCustomization(settings);
        }
    } else {
        _instance = new ServerCustomization(settings);
        console.log('[Customization] No customization configured. Using defaults.');
    }

    return _instance;
}

/**
 * Get the customization synchronously. Returns null if not yet loaded.
 * Use getCustomization() for the async version that guarantees loading.
 */
export function getCustomizationSync() {
    return _instance;
}

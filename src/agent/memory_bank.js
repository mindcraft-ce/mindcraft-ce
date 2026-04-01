import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

/**
 * Sanitize a bot name to prevent path traversal.
 * Strips path separators, dots, and other dangerous characters.
 * @param {string} name - Raw bot name from profile
 * @returns {string} Safe name for use in file paths
 */
function sanitizeBotName(name) {
	return String(name).replace(/[\/\\:*?"<>|.]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
}

/**
 * Persistent location memory for the bot.
 * Stores named places (chests, furnaces, home base, build sites, etc.) with coordinates.
 * Data is saved to disk so it survives restarts and context trimming.
 * Locations are injected into the bot's prompt via $PLACES so the bot always
 * knows where things are without having to ask.
 */
export class MemoryBank {
	constructor(botName) {
		this.memory = {};
		this.botName = sanitizeBotName(botName);
		this._saveTimer = null;
		if (this.botName) {
			this.fp = `./bots/${this.botName}/places.json`;
			mkdirSync(`./bots/${this.botName}`, { recursive: true });
			this.load();
		}
	}

	/**
	 * Save a named location with coordinates and optional type tag.
	 * @param {string} name - Human-readable name (e.g. "main chest", "home base")
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @param {string} [type] - Optional type: "chest", "furnace", "base", "build", "poi", etc.
	 */
	rememberPlace(name, x, y, z, type = '') {
		this.memory[name] = {
			coords: [Math.floor(x), Math.floor(y), Math.floor(z)],
			type: type || '',
			savedAt: new Date().toISOString()
		};
		this._debouncedSave();
	}

	/**
	 * Get coordinates for a named location.
	 * Returns [x, y, z] array or null if not found.
	 * Supports both old format (plain array) and new format (object with coords).
	 */
	recallPlace(name) {
		const entry = this.memory[name];
		if (!entry) return null;
		// Support both formats: [x,y,z] (legacy) and {coords:[x,y,z]} (new)
		if (Array.isArray(entry)) return entry;
		return entry.coords;
	}

	/**
	 * Remove a saved location by name.
	 */
	forgetPlace(name) {
		if (this.memory[name]) {
			delete this.memory[name];
			this._debouncedSave();
			return true;
		}
		return false;
	}

	getJson() {
		return this.memory;
	}

	loadJson(json) {
		this.memory = json;
	}

	getKeys() {
		return Object.keys(this.memory).join(', ');
	}

	/**
	 * Get a formatted summary of all saved places for injection into the bot's prompt.
	 * Returns a string listing all locations with names, types, and coordinates.
	 */
	getSummary() {
		const entries = Object.entries(this.memory);
		if (entries.length === 0) return 'No saved locations.';
		const lines = entries.map(([name, val]) => {
			// Support both formats
			if (Array.isArray(val)) {
				return `  "${name}": x:${Math.floor(val[0])}, y:${Math.floor(val[1])}, z:${Math.floor(val[2])}`;
			}
			const typeStr = val.type ? ` [${val.type}]` : '';
			return `  "${name}"${typeStr}: x:${val.coords[0]}, y:${val.coords[1]}, z:${val.coords[2]}`;
		});
		return 'SAVED LOCATIONS:\n' + lines.join('\n');
	}

	/**
	 * Debounced save — coalesces rapid writes into a single disk write after 2 seconds.
	 * Prevents main-thread stalls from frequent block placement events.
	 */
	_debouncedSave() {
		if (this._saveTimer) clearTimeout(this._saveTimer);
		this._saveTimer = setTimeout(() => {
			this.save();
			this._saveTimer = null;
		}, 2000);
	}

	/**
	 * Save all locations to disk as JSON.
	 */
	save() {
		if (!this.fp) return;
		try {
			writeFileSync(this.fp, JSON.stringify(this.memory, null, 2));
		} catch (err) {
			console.error('Failed to save places:', err.message);
		}
	}

	/**
	 * Load locations from disk.
	 */
	load() {
		if (!this.fp) return;
		try {
			if (existsSync(this.fp)) {
				this.memory = JSON.parse(readFileSync(this.fp, 'utf8'));
				const count = Object.keys(this.memory).length;
				if (count > 0) console.log(`Loaded ${count} saved locations from file.`);
			}
		} catch (err) {
			console.error('Failed to load places:', err.message);
			this.memory = {};
		}
	}
}

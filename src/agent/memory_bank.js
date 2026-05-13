import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

export class MemoryBank {
	constructor(name) {
		this.memory = {};
		this.name = name;
		this.fp = name ? `./bots/${name}/places.json` : null;
	}

	rememberPlace(name, x, y, z) {
		this.memory[name] = [x, y, z];
		this.save();
	}

	recallPlace(name) {
		return this.memory[name];
	}

	getJson() {
		return this.memory
	}

	loadJson(json) {
		this.memory = json;
	}

	getKeys() {
		return Object.keys(this.memory).join(', ')
	}

	save() {
		if (!this.fp) return;
		try {
			mkdirSync(`./bots/${this.name}`, { recursive: true });
			writeFileSync(this.fp, JSON.stringify(this.memory, null, 2));
		} catch (e) {
			console.error(`MemoryBank save failed for ${this.name}:`, e.message);
		}
	}

	load() {
		if (!this.fp || !existsSync(this.fp)) return;
		try {
			this.memory = JSON.parse(readFileSync(this.fp, 'utf8'));
		} catch (e) {
			console.error(`MemoryBank load failed for ${this.name}:`, e.message);
		}
	}
}

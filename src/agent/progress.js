// Digging may stand still; travel must reach new ground rather than circle forever.
export class ProgressTracker {
    constructor(now = Date.now) { this.now = now; this.reset(); }
    reset() {
        this.updatedAt = this.now();
        this.message = '';
        this.dig = null;
        this.visited = new Map();
    }
    report(message) { this.updatedAt = this.now(); this.message = message; }
    observe(bot) {
        const now = this.now();
        const block = bot.targetDigBlock;
        const key = block?.position?.toString();
        if (key && key !== this.dig?.key) {
            const duration = bot.digTime(block);
            this.dig = {key, until: now + Math.min(Number.isFinite(duration) ? duration : 0, 300000) + 5000};
            this.report(`Mining ${block.name}`);
        } else if (!key) this.dig = null;
        const p = bot.entity?.position;
        if (!p) return;
        const cell = `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`;
        if (!this.visited.has(cell) || now - this.visited.get(cell) > 120000) {
            this.visited.set(cell, now);
            this.updatedAt = now;
        }
        if (this.visited.size > 2048) this.visited.delete(this.visited.keys().next().value);
    }
    healthy(withinMs = 20000) {
        return this.now() - this.updatedAt < withinMs || Boolean(this.dig && this.now() < this.dig.until);
    }
}

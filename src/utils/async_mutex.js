export class AsyncMutex {
    constructor() {
        this.tail = Promise.resolve();
        this.pending = 0;
    }

    async runExclusive(operation) {
        if (typeof operation !== 'function') {
            throw new TypeError('AsyncMutex operation must be a function.');
        }

        let release;
        const previous = this.tail;
        this.tail = new Promise(resolve => {
            release = resolve;
        });
        this.pending++;

        await previous;
        try {
            return await operation();
        } finally {
            this.pending--;
            release();
        }
    }

    isLocked() {
        return this.pending > 0;
    }
}

// Brain-to-Task message queue for parallel operation.
// item shape: { source, message, timestamp, type: 'context'|'cancel'|'new_task' }

export class MessageQueue {
    constructor() {
        this.queue = [];
    }

    enqueue(item) {
        this.queue.push({ ...item, timestamp: item.timestamp || Date.now() });
    }

    drain() {
        return this.queue.splice(0);
    }

    hasItems() {
        return this.queue.length > 0;
    }

    hasCancelRequest() {
        return this.queue.some(item => item.type === 'cancel');
    }

    clear() {
        this.queue.length = 0;
    }
}

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { runAsAction } from '../../agent/commands/actions.js';

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.customMemories = [];
        this.memory_fp = `./bots/${this.name}/custom_memories.json`;
        
        // Ensure the bot directory exists
        mkdirSync(`./bots/${this.name}`, { recursive: true });
        
        // Load existing memories
        this.loadMemories();
    }

    init() {
        console.log('Memory plugin initialized for', this.name);
    }

    loadMemories() {
        try {
            if (existsSync(this.memory_fp)) {
                const data = readFileSync(this.memory_fp, 'utf8');
                this.customMemories = JSON.parse(data);
                console.log(`Loaded ${this.customMemories.length} custom memories for ${this.name}`);
            } else {
                this.customMemories = [];
                console.log('No custom memories file found, starting fresh');
            }
        } catch (error) {
            console.error('Failed to load custom memories:', error);
            this.customMemories = [];
        }
    }

    saveMemories() {
        try {
            writeFileSync(this.memory_fp, JSON.stringify(this.customMemories, null, 2));
            console.log(`Saved ${this.customMemories.length} custom memories to ${this.memory_fp}`);
        } catch (error) {
            console.error('Failed to save custom memories:', error);
        }
    }

    addMemory(memoryText) {
        const timestamp = new Date().toISOString();
        const memory = {
            text: memoryText,
            timestamp: timestamp,
            id: Date.now() // Simple unique ID
        };
        
        this.customMemories.push(memory);
        this.saveMemories();
        return memory;
    }

    getAllMemories() {
        return this.customMemories;
    }

    formatMemoriesForDisplay() {
        if (this.customMemories.length === 0) {
            return "I have no custom memories stored.";
        }
        
        let formattedMemories = "My stored memories:\n";
        this.customMemories.forEach((memory, index) => {
            const date = new Date(memory.timestamp).toLocaleString();
            formattedMemories += `${index + 1}. [${date}] ${memory.text}\n`;
        });
        
        return formattedMemories;
    }

    findSimilarMemory(newMemory) {
        // Find memories that are 97% similar using simple string similarity
        const newMemoryLower = newMemory.toLowerCase().trim();
        
        for (let i = 0; i < this.customMemories.length; i++) {
            const existingMemory = this.customMemories[i].text.toLowerCase().trim();
            const similarity = this.calculateSimilarity(newMemoryLower, existingMemory);
            
            if (similarity >= 0.97) {
                return i; // Return index of similar memory
            }
        }
        return -1; // No similar memory found
    }

    calculateSimilarity(str1, str2) {
        // Simple similarity calculation using character overlap
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    removeMemory(index) {
        if (index >= 0 && index < this.customMemories.length) {
            const removed = this.customMemories.splice(index, 1)[0];
            this.saveMemories();
            return removed;
        }
        return null;
    }

    getPluginActions() {
        return [
            {
                name: '!addMemory',
                description: 'Add something important to remember for the future. Use !recallMemory to view all stored memories.',
                params: {
                    'memory': {
                        type: 'string', 
                        description: 'The information or experience to remember (e.g., "The diamond ore vein is located at coordinates 100, 50, 200")'
                    },
                },
                perform: runAsAction(async (agent, memory) => {
                    // Check for similar memories and replace if found
                    const similarIndex = this.findSimilarMemory(memory);
                    if (similarIndex !== -1) {
                        this.removeMemory(similarIndex);
                    }
                    
                    // Add the new memory
                    this.addMemory(memory);
                }),
            },
            {
                name: '!recallMemory',
                description: 'Recall and display all stored memories.',
                params: {},
                perform: runAsAction(async (agent) => {
                    const memories = this.formatMemoriesForDisplay();
                    
                    // Split long messages to avoid chat limits
                    const maxLength = 100; // Minecraft chat character limit
                    const lines = memories.split('\n');
                    let currentMessage = '';
                    
                    for (const line of lines) {
                        if (currentMessage.length + line.length + 1 > maxLength) {
                            if (currentMessage.trim()) {
                                agent.bot.chat(currentMessage.trim());
                                await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between messages
                            }
                            currentMessage = line;
                        } else {
                            currentMessage += (currentMessage ? '\n' : '') + line;
                        }
                    }
                    
                    if (currentMessage.trim()) {
                        agent.bot.chat(currentMessage.trim());
                    }
                }),
            },
            {
                name: '!removeMemory',
                description: 'Remove a specific memory by its number. Use !recallMemory first to see memory numbers.',
                params: {
                    'memoryNumber': {
                        type: 'int',
                        description: 'The number of the memory to remove (as shown in !recallMemory)'
                    },
                },
                perform: runAsAction(async (agent, memoryNumber) => {
                    const index = memoryNumber - 1; // Convert from 1-based to 0-based indexing
                    const removed = this.removeMemory(index);
                    
                    if (removed) {
                        // Memory successfully removed, no chat message needed
                    } else {
                        // Invalid memory number, no chat message needed
                    }
                }),
            },
        ];
    }
}

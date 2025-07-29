import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Analytics data storage
export class AnalyticsManager {
    constructor() {
        this.agentAnalytics = {};
        this.messageHistory = {};
        this.systemMetrics = {
            startTime: Date.now(),
            totalConnections: 0,
            totalMessages: 0,
            peakConcurrentAgents: 0
        };
        
        this.analyticsDir = path.join(__dirname, 'analytics');
        this.ensureAnalyticsDirectory();
        this.loadExistingData();
        
        // Auto-save every 5 minutes
        setInterval(() => this.saveAnalytics(), 5 * 60 * 1000);
    }
    
    ensureAnalyticsDirectory() {
        if (!fs.existsSync(this.analyticsDir)) {
            fs.mkdirSync(this.analyticsDir, { recursive: true });
        }
    }
    
    loadExistingData() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const filename = path.join(this.analyticsDir, `analytics_${today}.json`);
            
            if (fs.existsSync(filename)) {
                const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
                this.agentAnalytics = data.agentAnalytics || {};
                this.messageHistory = data.messageHistory || {};
                console.log('Loaded existing analytics data');
            }
        } catch (error) {
            console.error('Error loading analytics data:', error);
        }
    }
    
    initializeAgent(agentName) {
        if (!this.agentAnalytics[agentName]) {
            this.agentAnalytics[agentName] = {
                name: agentName,
                loginTime: Date.now(),
                totalOnlineTime: 0,
                sessionsCount: 0,
                messagesReceived: 0,
                messagesSent: 0,
                commandsExecuted: 0,
                lastActivity: Date.now(),
                
                // Game status
                health: 20,
                hunger: 20,
                xp: 0,
                level: 0,
                location: { x: 0, y: 0, z: 0, dimension: 'overworld' },
                inventory: [],
                
                // Combat statistics
                combatStats: {
                    kills: 0,
                    deaths: 0,
                    damageDealt: 0,
                    damageTaken: 0,
                    mobsKilled: {},
                    playersKilled: 0,
                    deathCauses: {},
                    deathLocations: [],
                    lastDeathTime: null,
                    lastDeathCause: null
                },
                
                // Activity metrics
                activityStats: {
                    blocksPlaced: 0,
                    blocksBroken: 0,
                    itemsCrafted: 0,
                    distanceTraveled: 0,
                    timesMoved: 0,
                    chatMessages: 0
                },
                
                // Performance metrics
                performance: {
                    averageResponseTime: 0,
                    totalRequests: 0,
                    errorCount: 0,
                    lastError: null
                }
            };
        }
        
        if (!this.messageHistory[agentName]) {
            this.messageHistory[agentName] = [];
        }
        
        this.agentAnalytics[agentName].sessionsCount++;
        this.agentAnalytics[agentName].loginTime = Date.now();
        this.systemMetrics.totalConnections++;
    }
    
    updateAgentStatus(agentName, statusData) {
        if (!this.agentAnalytics[agentName]) {
            this.initializeAgent(agentName);
        }
        
        const agent = this.agentAnalytics[agentName];
        
        // Update basic status
        if (statusData.health !== undefined) agent.health = statusData.health;
        if (statusData.hunger !== undefined) agent.hunger = statusData.hunger;
        if (statusData.xp !== undefined) agent.xp = statusData.xp;
        if (statusData.level !== undefined) agent.level = statusData.level;
        if (statusData.location) agent.location = { ...agent.location, ...statusData.location };
        if (statusData.inventory) agent.inventory = statusData.inventory;
        
        // Update combat stats
        if (statusData.combatStats) {
            Object.assign(agent.combatStats, statusData.combatStats);
        }
        
        // Update activity stats
        if (statusData.activityStats) {
            Object.assign(agent.activityStats, statusData.activityStats);
        }
        
        // Update performance metrics
        if (statusData.performance) {
            Object.assign(agent.performance, statusData.performance);
        }
        
        agent.lastActivity = Date.now();
    }
    
    recordMessage(agentName, messageData) {
        if (!this.messageHistory[agentName]) {
            this.messageHistory[agentName] = [];
        }
        
        const message = {
            ...messageData,
            timestamp: Date.now(),
            id: this.generateMessageId()
        };
        
        this.messageHistory[agentName].push(message);
        
        // Keep only last 1000 messages per agent
        if (this.messageHistory[agentName].length > 1000) {
            this.messageHistory[agentName] = this.messageHistory[agentName].slice(-1000);
        }
        
        // Update analytics
        if (this.agentAnalytics[agentName]) {
            if (messageData.from === 'web-client') {
                this.agentAnalytics[agentName].messagesReceived++;
                if (messageData.type === 'command') {
                    this.agentAnalytics[agentName].commandsExecuted++;
                }
            } else {
                this.agentAnalytics[agentName].messagesSent++;
            }
            this.agentAnalytics[agentName].lastActivity = Date.now();
        }
        
        this.systemMetrics.totalMessages++;
        
        return message;
    }
    
    recordAgentDeath(agentName, deathData) {
        if (!this.agentAnalytics[agentName]) {
            this.initializeAgent(agentName);
        }
        
        const agent = this.agentAnalytics[agentName];
        agent.combatStats.deaths++;
        agent.combatStats.lastDeathTime = Date.now();
        
        if (deathData.cause) {
            agent.combatStats.lastDeathCause = deathData.cause;
            if (!agent.combatStats.deathCauses[deathData.cause]) {
                agent.combatStats.deathCauses[deathData.cause] = 0;
            }
            agent.combatStats.deathCauses[deathData.cause]++;
        }
        
        if (deathData.location) {
            agent.combatStats.deathLocations.push({
                ...deathData.location,
                timestamp: Date.now(),
                cause: deathData.cause
            });
            
            // Keep only last 50 death locations
            if (agent.combatStats.deathLocations.length > 50) {
                agent.combatStats.deathLocations = agent.combatStats.deathLocations.slice(-50);
            }
        }
        
        agent.lastActivity = Date.now();
        console.log(`Recorded death for ${agentName}: ${deathData.cause || 'unknown cause'}`);
    }
    
    recordAgentLogout(agentName) {
        if (this.agentAnalytics[agentName]) {
            const loginTime = this.agentAnalytics[agentName].loginTime;
            const sessionTime = Date.now() - loginTime;
            this.agentAnalytics[agentName].totalOnlineTime += sessionTime;
        }
    }
    
    getAnalyticsSummary(activeAgents = []) {
        const agents = Object.keys(this.agentAnalytics).map(name => ({
            name,
            ...this.agentAnalytics[name],
            isOnline: activeAgents.includes(name)
        }));
        
        const totalMessages = Object.values(this.messageHistory)
            .reduce((sum, history) => sum + history.length, 0);
        
        const currentConcurrentAgents = activeAgents.length;
        if (currentConcurrentAgents > this.systemMetrics.peakConcurrentAgents) {
            this.systemMetrics.peakConcurrentAgents = currentConcurrentAgents;
        }
        
        return {
            agents,
            totalMessages,
            activeAgents: currentConcurrentAgents,
            systemMetrics: {
                ...this.systemMetrics,
                uptime: Date.now() - this.systemMetrics.startTime,
                peakConcurrentAgents: this.systemMetrics.peakConcurrentAgents
            },
            timestamp: Date.now()
        };
    }
    
    getAgentMessageHistory(agentName) {
        return this.messageHistory[agentName] || [];
    }
    
    clearAgentMessageHistory(agentName) {
        this.messageHistory[agentName] = [];
        this.saveAnalytics();
    }
    
    exportAnalyticsData() {
        const exportData = {
            agentAnalytics: this.agentAnalytics,
            messageHistory: this.messageHistory,
            systemMetrics: this.systemMetrics,
            exportTime: Date.now(),
            summary: {
                totalAgents: Object.keys(this.agentAnalytics).length,
                totalMessages: Object.values(this.messageHistory)
                    .reduce((sum, history) => sum + history.length, 0),
                totalUptime: Date.now() - this.systemMetrics.startTime,
                averageSessionTime: this.calculateAverageSessionTime(),
                mostActiveAgent: this.getMostActiveAgent(),
                combatSummary: this.getCombatSummary()
            }
        };
        
        return exportData;
    }
    
    calculateAverageSessionTime() {
        const agents = Object.values(this.agentAnalytics);
        if (agents.length === 0) return 0;
        
        const totalTime = agents.reduce((sum, agent) => sum + agent.totalOnlineTime, 0);
        const totalSessions = agents.reduce((sum, agent) => sum + agent.sessionsCount, 0);
        
        return totalSessions > 0 ? totalTime / totalSessions : 0;
    }
    
    getMostActiveAgent() {
        const agents = Object.values(this.agentAnalytics);
        if (agents.length === 0) return null;
        
        return agents.reduce((most, agent) => {
            const activity = agent.messagesReceived + agent.messagesSent + agent.commandsExecuted;
            const mostActivity = most.messagesReceived + most.messagesSent + most.commandsExecuted;
            return activity > mostActivity ? agent : most;
        });
    }
    
    getCombatSummary() {
        const agents = Object.values(this.agentAnalytics);
        
        return {
            totalKills: agents.reduce((sum, agent) => sum + agent.combatStats.kills, 0),
            totalDeaths: agents.reduce((sum, agent) => sum + agent.combatStats.deaths, 0),
            totalDamageDealt: agents.reduce((sum, agent) => sum + agent.combatStats.damageDealt, 0),
            totalDamageTaken: agents.reduce((sum, agent) => sum + agent.combatStats.damageTaken, 0),
            bestKDRatio: this.getBestKDRatio(agents)
        };
    }
    
    getBestKDRatio(agents) {
        let bestAgent = null;
        let bestRatio = 0;
        
        agents.forEach(agent => {
            const kills = agent.combatStats.kills;
            const deaths = agent.combatStats.deaths;
            const ratio = deaths > 0 ? kills / deaths : kills;
            
            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestAgent = agent.name;
            }
        });
        
        return { agent: bestAgent, ratio: bestRatio };
    }
    
    saveAnalytics() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const filename = path.join(this.analyticsDir, `analytics_${today}.json`);
            
            const analyticsData = {
                agentAnalytics: this.agentAnalytics,
                messageHistory: this.messageHistory,
                systemMetrics: this.systemMetrics,
                timestamp: Date.now()
            };
            
            fs.writeFileSync(filename, JSON.stringify(analyticsData, null, 2));
            
            // Also save a backup with timestamp
            const backupFilename = path.join(this.analyticsDir, `backup_${Date.now()}.json`);
            fs.writeFileSync(backupFilename, JSON.stringify(analyticsData, null, 2));
            
            // Clean up old backups (keep only last 10)
            this.cleanupOldBackups();
            
        } catch (error) {
            console.error('Error saving analytics:', error);
        }
    }
    
    cleanupOldBackups() {
        try {
            const files = fs.readdirSync(this.analyticsDir)
                .filter(file => file.startsWith('backup_'))
                .map(file => ({
                    name: file,
                    path: path.join(this.analyticsDir, file),
                    time: fs.statSync(path.join(this.analyticsDir, file)).mtime
                }))
                .sort((a, b) => b.time - a.time);
            
            // Keep only the 10 most recent backups
            files.slice(10).forEach(file => {
                fs.unlinkSync(file.path);
            });
        } catch (error) {
            console.error('Error cleaning up backups:', error);
        }
    }
    
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Performance monitoring
    recordPerformanceMetric(agentName, metric, value) {
        if (!this.agentAnalytics[agentName]) {
            this.initializeAgent(agentName);
        }
        
        const performance = this.agentAnalytics[agentName].performance;
        
        switch (metric) {
            case 'responseTime':
                const totalTime = performance.averageResponseTime * performance.totalRequests;
                performance.totalRequests++;
                performance.averageResponseTime = (totalTime + value) / performance.totalRequests;
                break;
            case 'error':
                performance.errorCount++;
                performance.lastError = {
                    message: value,
                    timestamp: Date.now()
                };
                break;
        }
    }
    
    // Get performance insights
    getPerformanceInsights() {
        const agents = Object.values(this.agentAnalytics);
        
        return {
            averageResponseTime: agents.reduce((sum, agent) => 
                sum + agent.performance.averageResponseTime, 0) / agents.length,
            totalErrors: agents.reduce((sum, agent) => 
                sum + agent.performance.errorCount, 0),
            mostReliableAgent: agents.reduce((best, agent) => 
                agent.performance.errorCount < best.performance.errorCount ? agent : best),
            fastestAgent: agents.reduce((fastest, agent) => 
                agent.performance.averageResponseTime < fastest.performance.averageResponseTime ? agent : fastest)
        };
    }
}

// Export singleton instance
export const analyticsManager = new AnalyticsManager();
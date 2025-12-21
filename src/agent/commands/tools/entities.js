import BaseTool from "../base_tool.js";
import * as world from "../../library/world.js";
import convoManager from "../../conversation.js";

class EntitiesTool extends BaseTool {
    constructor() {
        super(
            "entities",
            "Get the nearby players and entities.",
            [],
            false
        );
    }

    async execute(agent) {
        let bot = agent.bot;
        let res = 'NEARBY_ENTITIES';
        let players = world.getNearbyPlayerNames(bot);
        let bots = convoManager.getInGameAgents().filter(b => b !== agent.name);
        players = players.filter(p => !bots.includes(p));

        for (const player of players) {
            res += `\n- Human player: ${player}`;
        }
        for (const bot of bots) {
            res += `\n- Bot player: ${bot}`;
        }

        let nearbyEntities = world.getNearbyEntities(bot);
        let entityCounts = {};
        let villagerIds = [];
        let babyVillagerIds = [];
        let villagerDetails = []; // Store detailed villager info including profession
        
        for (const entity of nearbyEntities) {
            if (entity.type === 'player' || entity.name === 'item')
                continue;
                
            if (!entityCounts[entity.name]) {
                entityCounts[entity.name] = 0;
            }
            entityCounts[entity.name]++;
            
            if (entity.name === 'villager') {
                if (entity.metadata && entity.metadata[16] === 1) {
                    babyVillagerIds.push(entity.id);
                } else {
                    const profession = world.getVillagerProfession(entity);
                    villagerIds.push(entity.id);
                    villagerDetails.push({
                        id: entity.id,
                        profession: profession
                    });
                }
            }
        }
        
        for (const [entityType, count] of Object.entries(entityCounts)) {
            if (entityType === 'villager') {
                let villagerInfo = `${count} ${entityType}(s)`;
                if (villagerDetails.length > 0) {
                    const detailStrings = villagerDetails.map(v => `(${v.id}:${v.profession})`);
                    villagerInfo += ` - Adults: ${detailStrings.join(', ')}`;
                }
                if (babyVillagerIds.length > 0) {
                    villagerInfo += ` - Baby IDs: ${babyVillagerIds.join(', ')} (babies cannot trade)`;
                }
                res += `\n- entities: ${villagerInfo}`;
            } else {
                res += `\n- entities: ${count} ${entityType}(s)`;
            }
        }
        
        if (res == 'NEARBY_ENTITIES') {
            res += ': none';
        }
        return '\n' + res + '\n';
    }
}

export default EntitiesTool;

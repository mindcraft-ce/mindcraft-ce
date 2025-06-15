import * as mc from "../../utils/mcdata.js";
import * as world from "./world.js";
import pf from 'mineflayer-pathfinder';
import Vec3 from 'vec3';


export function log(bot, message) {
    bot.output += message + '\n';
}

async function autoLight(bot) {
    if (world.shouldPlaceTorch(bot)) {
        try {
            const pos = world.getPosition(bot);
            return await placeBlock(bot, 'torch', pos.x, pos.y, pos.z, 'bottom', true);
        } catch (err) {return false;}
    }
    return false;
}

async function equipHighestAttack(bot) {
    let weapons = bot.inventory.items().filter(item => item.name.includes('sword') || (item.name.includes('axe') && !item.name.includes('pickaxe')));
    if (weapons.length === 0)
        weapons = bot.inventory.items().filter(item => item.name.includes('pickaxe') || item.name.includes('shovel'));
    if (weapons.length === 0)
        return;
    weapons.sort((a, b) => a.attackDamage < b.attackDamage);
    let weapon = weapons[0];
    if (weapon)
        await bot.equip(weapon, 'hand');
}

export async function craftRecipe(bot, itemName, num=1) {
    /**
     * Attempt to craft the given item name from a recipe. May craft many items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to craft.
     * @returns {Promise<boolean>} true if the recipe was crafted, false otherwise.
     * @example
     * await skills.craftRecipe(bot, "stick");
     **/
    let placedTable = false;

    if (mc.getItemCraftingRecipes(itemName).length == 0) {
        log(bot, `${itemName} is either not an item, or it does not have a crafting recipe!`);
        return false;
    }

    // get recipes that don't require a crafting table
    let recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, null); 
    let craftingTable = null;
    const craftingTableRange = 32;
    placeTable: if (!recipes || recipes.length === 0) {
        recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, true);
        if(!recipes || recipes.length === 0) break placeTable; //Don't bother going to the table if we don't have the required resources.

        // Look for crafting table
        craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
        if (craftingTable === null){

            // Try to place crafting table
            let hasTable = world.getInventoryCounts(bot)['crafting_table'] > 0;
            if (hasTable) {
                let pos = world.getNearestFreeSpace(bot, 1, 6);
                await placeBlock(bot, 'crafting_table', pos.x, pos.y, pos.z);
                craftingTable = world.getNearestBlock(bot, 'crafting_table', craftingTableRange);
                if (craftingTable) {
                    recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
                    placedTable = true;
                }
            }
            else {
                log(bot, `Crafting ${itemName} requires a crafting table.`)
                return false;
            }
        }
        else {
            recipes = bot.recipesFor(mc.getItemId(itemName), null, 1, craftingTable);
        }
    }
    if (!recipes || recipes.length === 0) {
        log(bot, `You do not have the resources to craft a ${itemName}. It requires: ${Object.entries(mc.getItemCraftingRecipes(itemName)[0][0]).map(([key, value]) => `${key}: ${value}`).join(', ')}.`);
        if (placedTable) {
            await collectBlock(bot, 'crafting_table', 1);
        }
        return false;
    }
    
    if (craftingTable && bot.entity.position.distanceTo(craftingTable.position) > 4) {
        await goToNearestBlock(bot, 'crafting_table', 4, craftingTableRange);
    }

    const recipe = recipes[0];
    console.log('crafting...');
    //Check that the agent has sufficient items to use the recipe `num` times.
    const inventory = world.getInventoryCounts(bot); //Items in the agents inventory
    const requiredIngredients = mc.ingredientsFromPrismarineRecipe(recipe); //Items required to use the recipe once.
    const craftLimit = mc.calculateLimitingResource(inventory, requiredIngredients);
    
    await bot.craft(recipe, Math.min(craftLimit.num, num), craftingTable);
    if(craftLimit.num<num) log(bot, `Not enough ${craftLimit.limitingResource} to craft ${num}, crafted ${craftLimit.num}. You now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}.`);
    else log(bot, `Successfully crafted ${itemName}, you now have ${world.getInventoryCounts(bot)[itemName]} ${itemName}.`);
    if (placedTable) {
        await collectBlock(bot, 'crafting_table', 1);
    }

    //Equip any armor the bot may have crafted.
    //There is probablly a more efficient method than checking the entire inventory but this is all mineflayer-armor-manager provides. :P
    bot.armorManager.equipAll(); 

    return true;
}

export async function wait(bot, milliseconds) {
    /**
     * Waits for the given number of milliseconds.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} milliseconds, the number of milliseconds to wait.
     * @returns {Promise<boolean>} true if the wait was successful, false otherwise.
     * @example
     * await skills.wait(bot, 1000);
     **/
    // setTimeout is disabled to prevent unawaited code, so this is a safe alternative that enables interrupts
    let timeLeft = milliseconds;
    let startTime = Date.now();
    
    while (timeLeft > 0) {
        if (bot.interrupt_code) return false;
        
        let waitTime = Math.min(2000, timeLeft);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        let elapsed = Date.now() - startTime;
        timeLeft = milliseconds - elapsed;
    }
    return true;
}

export async function smeltItem(bot, itemName, num=1) {
    /**
     * Puts 1 coal in furnace and smelts the given item name, waits until the furnace runs out of fuel or input items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item name to smelt. Ores must contain "raw" like raw_iron.
     * @param {number} num, the number of items to smelt. Defaults to 1.
     * @returns {Promise<boolean>} true if the item was smelted, false otherwise. Fail
     * @example
     * await skills.smeltItem(bot, "raw_iron");
     * await skills.smeltItem(bot, "beef");
     **/

    if (!mc.isSmeltable(itemName)) {
        log(bot, `Cannot smelt ${itemName}. Hint: make sure you are smelting the 'raw' item.`);
        return false;
    }

    let placedFurnace = false;
    let furnaceBlock = undefined;
    const furnaceRange = 32;
    furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
    if (!furnaceBlock){
        // Try to place furnace
        let hasFurnace = world.getInventoryCounts(bot)['furnace'] > 0;
        if (hasFurnace) {
            let pos = world.getNearestFreeSpace(bot, 1, furnaceRange);
            await placeBlock(bot, 'furnace', pos.x, pos.y, pos.z);
            furnaceBlock = world.getNearestBlock(bot, 'furnace', furnaceRange);
            placedFurnace = true;
        }
    }
    if (!furnaceBlock){
        log(bot, `There is no furnace nearby and you have no furnace.`)
        return false;
    }
    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, furnaceRange);
    }
    bot.modes.pause('unstuck');
    await bot.lookAt(furnaceBlock.position);

    console.log('smelting...');
    const furnace = await bot.openFurnace(furnaceBlock);
    // check if the furnace is already smelting something
    let input_item = furnace.inputItem();
    if (input_item && input_item.type !== mc.getItemId(itemName) && input_item.count > 0) {
        // TODO: check if furnace is currently burning fuel. furnace.fuel is always null, I think there is a bug.
        // This only checks if the furnace has an input item, but it may not be smelting it and should be cleared.
        log(bot, `The furnace is currently smelting ${mc.getItemName(input_item.type)}.`);
        if (placedFurnace)
            await collectBlock(bot, 'furnace', 1);
        return false;
    }
    // check if the bot has enough items to smelt
    let inv_counts = world.getInventoryCounts(bot);
    if (!inv_counts[itemName] || inv_counts[itemName] < num) {
        log(bot, `You do not have enough ${itemName} to smelt.`);
        if (placedFurnace)
            await collectBlock(bot, 'furnace', 1);
        return false;
    }

    // fuel the furnace
    if (!furnace.fuelItem()) {
        let fuel = mc.getSmeltingFuel(bot);
        if (!fuel) {
            log(bot, `You have no fuel to smelt ${itemName}, you need coal, charcoal, or wood.`);
            if (placedFurnace)
                await collectBlock(bot, 'furnace', 1);
            return false;
        }
        log(bot, `Using ${fuel.name} as fuel.`);

        const put_fuel = Math.ceil(num / mc.getFuelSmeltOutput(fuel.name));

        if (fuel.count < put_fuel) {
            log(bot, `You don't have enough ${fuel.name} to smelt ${num} ${itemName}; you need ${put_fuel}.`);
            if (placedFurnace)
                await collectBlock(bot, 'furnace', 1);
            return false;
        }
        await furnace.putFuel(fuel.type, null, put_fuel);
        log(bot, `Added ${put_fuel} ${mc.getItemName(fuel.type)} to furnace fuel.`);
        console.log(`Added ${put_fuel} ${mc.getItemName(fuel.type)} to furnace fuel.`)
    }
    // put the items in the furnace
    await furnace.putInput(mc.getItemId(itemName), null, num);
    // wait for the items to smelt
    let total = 0;
    let collected_last = true;
    let smelted_item = null;
    await new Promise(resolve => setTimeout(resolve, 200));
    while (total < num) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        console.log('checking...');
        let collected = false;
        if (furnace.outputItem()) {
            smelted_item = await furnace.takeOutput();
            if (smelted_item) {
                total += smelted_item.count;
                collected = true;
            }
        }
        if (!collected && !collected_last) {
            break; // if nothing was collected this time or last time
        }
        collected_last = collected;
        if (bot.interrupt_code) {
            break;
        }
    }
    await bot.closeWindow(furnace);

    if (placedFurnace) {
        await collectBlock(bot, 'furnace', 1);
    }
    if (total === 0) {
        log(bot, `Failed to smelt ${itemName}.`);
        return false;
    }
    if (total < num) {
        log(bot, `Only smelted ${total} ${mc.getItemName(smelted_item.type)}.`);
        return false;
    }
    log(bot, `Successfully smelted ${itemName}, got ${total} ${mc.getItemName(smelted_item.type)}.`);
    return true;
}

export async function clearNearestFurnace(bot) {
    /**
     * Clears the nearest furnace of all items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the furnace was cleared, false otherwise.
     * @example
     * await skills.clearNearestFurnace(bot);
     **/
    let furnaceBlock = world.getNearestBlock(bot, 'furnace', 32);
    if (!furnaceBlock) {
        log(bot, `No furnace nearby to clear.`);
        return false;
    }
    if (bot.entity.position.distanceTo(furnaceBlock.position) > 4) {
        await goToNearestBlock(bot, 'furnace', 4, 32);
    }

    console.log('clearing furnace...');
    const furnace = await bot.openFurnace(furnaceBlock);
    console.log('opened furnace...')
    // take the items out of the furnace
    let smelted_item, intput_item, fuel_item;
    if (furnace.outputItem())
        smelted_item = await furnace.takeOutput();
    if (furnace.inputItem())
        intput_item = await furnace.takeInput();
    if (furnace.fuelItem())
        fuel_item = await furnace.takeFuel();
    console.log(smelted_item, intput_item, fuel_item)
    let smelted_name = smelted_item ? `${smelted_item.count} ${smelted_item.name}` : `0 smelted items`;
    let input_name = intput_item ? `${intput_item.count} ${intput_item.name}` : `0 input items`;
    let fuel_name = fuel_item ? `${fuel_item.count} ${fuel_item.name}` : `0 fuel items`;
    log(bot, `Cleared furnace, received ${smelted_name}, ${input_name}, and ${fuel_name}.`);
    return true;

}


export async function attackNearest(bot, mobType, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} mobType, the type of mob to attack.
     * @param {boolean} kill, whether or not to continue attacking until the mob is dead. Defaults to true.
     * @returns {Promise<boolean>} true if the mob was attacked, false if the mob type was not found.
     * @example
     * await skills.attackNearest(bot, "zombie", true);
     **/
    bot.modes.pause('cowardice');
    if (mobType === 'drowned' || mobType === 'cod' || mobType === 'salmon' || mobType === 'tropical_fish' || mobType === 'squid')
        bot.modes.pause('self_preservation'); // so it can go underwater. TODO: have an drowning mode so we don't turn off all self_preservation
    const mob = world.getNearbyEntities(bot, 24).find(entity => entity.name === mobType);
    if (mob) {
        return await attackEntity(bot, mob, kill);
    }
    log(bot, 'Could not find any '+mobType+' to attack.');
    return false;
}

export async function attackEntity(bot, entity, kill=true) {
    /**
     * Attack mob of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Entity} entity, the entity to attack.
     * @returns {Promise<boolean>} true if the entity was attacked, false if interrupted
     * @example
     * await skills.attackEntity(bot, entity);
     **/

    let pos = entity.position;
    await equipHighestAttack(bot)

    if (!kill) {
        if (bot.entity.position.distanceTo(pos) > 5) {
            console.log('moving to mob...')
            await goToPosition(bot, pos.x, pos.y, pos.z);
        }
        console.log('attacking mob...')
        await bot.attack(entity);
    }
    else {
        bot.pvp.attack(entity);
        while (world.getNearbyEntities(bot, 24).includes(entity)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (bot.interrupt_code) {
                bot.pvp.stop();
                return false;
            }
        }
        log(bot, `Successfully killed ${entity.name}.`);
        await pickupNearbyItems(bot);
        return true;
    }
}

export async function defendSelf(bot, range=9) {
    /**
     * Defend yourself from all nearby hostile mobs until there are no more.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} range, the range to look for mobs. Defaults to 8.
     * @returns {Promise<boolean>} true if the bot found any enemies and has killed them, false if no entities were found.
     * @example
     * await skills.defendSelf(bot);
     * **/
    bot.modes.pause('self_defense');
    bot.modes.pause('cowardice');
    let attacked = false;
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
    while (enemy) {
        await equipHighestAttack(bot);
        if (bot.entity.position.distanceTo(enemy.position) >= 4 && enemy.name !== 'creeper' && enemy.name !== 'phantom') {
            try {
                const movements = new pf.Movements(bot);
                movements.canFloat = true; // Enable swimming
                movements.allowSprinting = true; // Allow sprinting
                movements.allowParkour = true; // Allow parkour
                movements.canOpenDoors = true; // Enable automatic door opening
                movements.liquidCost = 1; // Make water less costly to traverse
                movements.climbCost = 1; // Adjust cost for climbing
                movements.jumpCost = 1; // Adjust cost for jumping
                movements.allowFreeMotion = true;
                movements.digCost = 100; // High cost for digging
                if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
                if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
                if (mc.ALL_OPENABLE_DOORS) {
                    mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                        const doorId = mc.getBlockId(doorName);
                        if (doorId) movements.blocksToOpen.add(doorId);
                    });
                }
                if (mc.ALL_OPENABLE_DOORS) {
                    mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                        const doorId = mc.getBlockId(doorName);
                        if (doorId) movements.blocksToOpen.add(doorId);
                    });
                }
                bot.pathfinder.setMovements(movements);
                await bot.pathfinder.goto(new pf.goals.GoalFollow(enemy, 3.5), true);
            } catch (err) {/* might error if entity dies, ignore */}
        }
        if (bot.entity.position.distanceTo(enemy.position) <= 2) {
            try {
                const movements = new pf.Movements(bot);
                movements.canFloat = true; // Enable swimming
                movements.allowSprinting = true; // Allow sprinting
                movements.allowParkour = true; // Allow parkour
                movements.canOpenDoors = true; // Enable automatic door opening
                movements.liquidCost = 1; // Make water less costly to traverse
                movements.climbCost = 1; // Adjust cost for climbing
                movements.jumpCost = 1; // Adjust cost for jumping
                movements.allowFreeMotion = true;
                movements.digCost = 100; // High cost for digging
                if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
                if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
                mc.ALL_WOODEN_DOORS.forEach(doorName => {
                    const doorId = mc.getBlockId(doorName);
                    if (doorId) movements.blocksToOpen.add(doorId);
                });
                bot.pathfinder.setMovements(movements);
                let inverted_goal = new pf.goals.GoalInvert(new pf.goals.GoalFollow(enemy, 2));
                await bot.pathfinder.goto(inverted_goal, true);
            } catch (err) {/* might error if entity dies, ignore */}
        }
        bot.pvp.attack(enemy);
        attacked = true;
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), range);
        if (bot.interrupt_code) {
            bot.pvp.stop();
            return false;
        }
    }
    bot.pvp.stop();
    if (attacked)
        log(bot, `Successfully defended self.`);
    else
        log(bot, `No enemies nearby to defend self from.`);
    return attacked;
}



export async function collectBlock(bot, blockType, num=1, exclude=null) {
    /**
     * Collect one of the given block type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to collect.
     * @param {number} num, the number of blocks to collect. Defaults to 1.
     * @returns {Promise<boolean>} true if the block was collected, false if the block type was not found.
     * @example
     * await skills.collectBlock(bot, "oak_log");
     **/
    if (num < 1) {
        log(bot, `Invalid number of blocks to collect: ${num}.`);
        return false;
    }
    let blocktypes = [blockType];
    if (blockType === 'coal' || blockType === 'diamond' || blockType === 'emerald' || blockType === 'iron' || blockType === 'gold' || blockType === 'lapis_lazuli' || blockType === 'redstone')
        blocktypes.push(blockType+'_ore');
    if (blockType.endsWith('ore'))
        blocktypes.push('deepslate_'+blockType);
    if (blockType === 'dirt')
        blocktypes.push('grass_block');

    let collected = 0;

    for (let i=0; i<num; i++) {
        let blocks = world.getNearestBlocks(bot, blocktypes, 64);
        if (exclude) {
            for (let position of exclude) {
                blocks = blocks.filter(
                    block => block.position.x !== position.x || block.position.y !== position.y || block.position.z !== position.z
                );
            }
        }
        const movements = new pf.Movements(bot);
        movements.canFloat = true; // Enable swimming
        movements.allowSprinting = true; // Allow sprinting
        movements.allowParkour = true; // Allow parkour
        movements.canOpenDoors = true; // Enable automatic door opening
        movements.liquidCost = 1; // Make water less costly to traverse
        movements.climbCost = 1; // Adjust cost for climbing
        movements.jumpCost = 1; // Adjust cost for jumping
        movements.allowFreeMotion = true;
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movements.blocksToOpen.add(doorId);
            });
        }
        // For collectBlock, we don't want to set a high digCost or avoid common blocks.
        // Specific settings for block breaking are handled by the logic within collectBlock.
        movements.dontMineUnderFallingBlock = false;
        blocks = blocks.filter(
            block => movements.safeToBreak(block)
        );

        if (blocks.length === 0) {
            if (collected === 0)
                log(bot, `No ${blockType} nearby to collect.`);
            else
                log(bot, `No more ${blockType} nearby to collect.`);
            break;
        }
        const block = blocks[0];
        await bot.tool.equipForBlock(block);
        const itemId = bot.heldItem ? bot.heldItem.type : null
        if (!block.canHarvest(itemId)) {
            log(bot, `Don't have right tools to harvest ${blockType}.`);
            return false;
        }
        try {
            if (mc.mustCollectManually(blockType)) {
                await goToPosition(bot, block.position.x, block.position.y, block.position.z, 2);
                await bot.dig(block);
                await pickupNearbyItems(bot);
            }
            else {
                await bot.collectBlock.collect(block);
            }
            collected++;
            await autoLight(bot);
        }
        catch (err) {
            if (err.name === 'NoChests') {
                log(bot, `Failed to collect ${blockType}: Inventory full, no place to deposit.`);
                break;
            }
            else {
                log(bot, `Failed to collect ${blockType}: ${err}.`);
                continue;
            }
        }
        
        if (bot.interrupt_code)
            break;  
    }
    log(bot, `Collected ${collected} ${blockType}.`);
    return collected > 0;
}

export async function pickupNearbyItems(bot) {
    /**
     * Pick up all nearby items.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the items were picked up, false otherwise.
     * @example
     * await skills.pickupNearbyItems(bot);
     **/
    const distance = 8;
    const getNearestItem = bot => bot.nearestEntity(entity => entity.name === 'item' && bot.entity.position.distanceTo(entity.position) < distance);
    let nearestItem = getNearestItem(bot);
    let pickedUp = 0;
    while (nearestItem) {
        const movements = new pf.Movements(bot);
        movements.canFloat = true; // Enable swimming
        movements.allowSprinting = true; // Allow sprinting
        movements.allowParkour = true; // Allow parkour
        movements.canOpenDoors = true; // Enable automatic door opening
        movements.liquidCost = 1; // Make water less costly to traverse
        movements.climbCost = 1; // Adjust cost for climbing
        movements.jumpCost = 1; // Adjust cost for jumping
        movements.allowFreeMotion = true;
        movements.digCost = 100;
        if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
        if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movements.blocksToOpen.add(doorId);
            });
        }
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new pf.goals.GoalFollow(nearestItem, 0.8), true);
        await new Promise(resolve => setTimeout(resolve, 200));
        let prev = nearestItem;
        nearestItem = getNearestItem(bot);
        if (prev === nearestItem) {
            break;
        }
        pickedUp++;
    }
    log(bot, `Picked up ${pickedUp} items.`);
    return true;
}


export async function breakBlockAt(bot, x, y, z) {
    /**
     * Break the block at the given position. Will use the bot's equipped item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate of the block to break.
     * @param {number} y, the y coordinate of the block to break.
     * @param {number} z, the z coordinate of the block to break.
     * @returns {Promise<boolean>} true if the block was broken, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.breakBlockAt(bot, position.x, position.y - 1, position.x);
     **/
    if (x == null || y == null || z == null) throw new Error('Invalid position to break block at.');
    let block = bot.blockAt(Vec3(x, y, z));
    if (block.name !== 'air' && block.name !== 'water' && block.name !== 'lava') {
        if (bot.modes.isOn('cheat')) {
            let msg = '/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) + ' air';
            bot.chat(msg);
            log(bot, `Used /setblock to break block at ${x}, ${y}, ${z}.`);
            return true;
        }

        if (bot.entity.position.distanceTo(block.position) > 4.5) {
            let pos = block.position;
            const movements = new pf.Movements(bot);
            movements.canFloat = true; // Enable swimming
            movements.allowSprinting = true; // Allow sprinting
            movements.allowParkour = true; // Allow parkour
            movements.canOpenDoors = true; // Enable automatic door opening
            movements.liquidCost = 1; // Make water less costly to traverse
            movements.climbCost = 1; // Adjust cost for climbing
            movements.jumpCost = 1; // Adjust cost for jumping
            movements.allowFreeMotion = true;
            // breakBlockAt is intended to break blocks, so no high digCost or blocksToAvoid here for the pathfinding movement part.
            // However, the primary action of breaking the target block should not be hindered.
            // The pathfinding to get *near* the block might still have these settings if we are not careful.
            // For now, let's assume pathfinding to the block to break it should be less restrictive.
            // We will NOT add high digCost or blocksToAvoid to this specific pathfinder instance.
            if (mc.ALL_OPENABLE_DOORS) {
                mc.ALL_OPENABLE_DOORS.forEach(doorName => { // Still allow opening doors to get to a block to break
                    const doorId = mc.getBlockId(doorName);
                    if (doorId) movements.blocksToOpen.add(doorId);
                });
            }
            movements.canPlaceOn = false;
            movements.allow1by1towers = false;
            bot.pathfinder.setMovements(movements);
            await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
        }
        if (bot.game.gameMode !== 'creative') {
            await bot.tool.equipForBlock(block);
            const itemId = bot.heldItem ? bot.heldItem.type : null
            if (!block.canHarvest(itemId)) {
                log(bot, `Don't have right tools to break ${block.name}.`);
                return false;
            }
        }
        await bot.dig(block, true);
        log(bot, `Broke ${block.name} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    else {
        log(bot, `Skipping block at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)} because it is ${block.name}.`);
        return false;
    }
    return true;
}


export async function placeBlock(bot, blockType, x, y, z, placeOn='bottom', dontCheat=false) {
    /**
     * Place the given block type at the given position. It will build off from any adjacent blocks. Will fail if there is a block in the way or nothing to build off of.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to place.
     * @param {number} x, the x coordinate of the block to place.
     * @param {number} y, the y coordinate of the block to place.
     * @param {number} z, the z coordinate of the block to place.
     * @param {string} placeOn, the preferred side of the block to place on. Can be 'top', 'bottom', 'north', 'south', 'east', 'west', or 'side'. Defaults to bottom. Will place on first available side if not possible.
     * @param {boolean} dontCheat, overrides cheat mode to place the block normally. Defaults to false.
     * @returns {Promise<boolean>} true if the block was placed, false otherwise.
     * @example
     * let p = world.getPosition(bot);
     * await skills.placeBlock(bot, "oak_log", p.x + 2, p.y, p.x);
     * await skills.placeBlock(bot, "torch", p.x + 1, p.y, p.x, 'side');
     **/
    if (!mc.getBlockId(blockType) && blockType !== 'air') {
        log(bot, `Invalid block type: ${blockType}.`);
        return false;
    }

    const target_dest = new Vec3(Math.floor(x), Math.floor(y), Math.floor(z));

    if (blockType === 'air') {
        log(bot, `Placing air (removing block) at ${target_dest}.`);
        return await breakBlockAt(bot, x, y, z);
    }

    if (bot.modes.isOn('cheat') && !dontCheat) {
        if (bot.restrict_to_inventory) {
            let block = bot.inventory.items().find(item => item.name === blockType);
            if (!block) {
                log(bot, `Cannot place ${blockType}, you are restricted to your current inventory.`);
                return false;
            }
        }

        // invert the facing direction
        let face = placeOn === 'north' ? 'south' : placeOn === 'south' ? 'north' : placeOn === 'east' ? 'west' : 'east';
        if (blockType.includes('torch') && placeOn !== 'bottom') {
            // insert wall_ before torch
            blockType = blockType.replace('torch', 'wall_torch');
            if (placeOn !== 'side' && placeOn !== 'top') {
                blockType += `[facing=${face}]`;
            }
        }
        if (blockType.includes('button') || blockType === 'lever') {
            if (placeOn === 'top') {
                blockType += `[face=ceiling]`;
            }
            else if (placeOn === 'bottom') {
                blockType += `[face=floor]`;
            }
            else {
                blockType += `[facing=${face}]`;
            }
        }
        if (blockType === 'ladder' || blockType === 'repeater' || blockType === 'comparator') {
            blockType += `[facing=${face}]`;
        }
        if (blockType.includes('stairs')) {
            blockType += `[facing=${face}]`;
        }
        let msg = '/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) + ' ' + blockType;
        bot.chat(msg);
        if (blockType.includes('door'))
            bot.chat('/setblock ' + Math.floor(x) + ' ' + Math.floor(y+1) + ' ' + Math.floor(z) + ' ' + blockType + '[half=upper]');
        if (blockType.includes('bed'))
            bot.chat('/setblock ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z-1) + ' ' + blockType + '[part=head]');
        log(bot, `Used /setblock to place ${blockType} at ${target_dest}.`);
        return true;
    }

    
    let item_name = blockType;
    if (item_name == "redstone_wire")
        item_name = "redstone";
    let block = bot.inventory.items().find(item => item.name === item_name);
    if (!block && bot.game.gameMode === 'creative' && !bot.restrict_to_inventory) {
        await bot.creative.setInventorySlot(36, mc.makeItem(item_name, 1)); // 36 is first hotbar slot
        block = bot.inventory.items().find(item => item.name === item_name);
    }
    if (!block) {
        log(bot, `Don't have any ${blockType} to place.`);
        return false;
    }

    const targetBlock = bot.blockAt(target_dest);
    if (targetBlock.name === blockType) {
        log(bot, `${blockType} already at ${targetBlock.position}.`);
        return false;
    }
    const empty_blocks = ['air', 'water', 'lava', 'grass', 'short_grass', 'tall_grass', 'snow', 'dead_bush', 'fern'];
    if (!empty_blocks.includes(targetBlock.name)) {
        log(bot, `${blockType} in the way at ${targetBlock.position}.`);
        const removed = await breakBlockAt(bot, x, y, z);
        if (!removed) {
            log(bot, `Cannot place ${blockType} at ${targetBlock.position}: block in the way.`);
            return false;
        }
        await new Promise(resolve => setTimeout(resolve, 200)); // wait for block to break
    }
    // get the buildoffblock and facevec based on whichever adjacent block is not empty
    let buildOffBlock = null;
    let faceVec = null;
    const dir_map = {
        'top': Vec3(0, 1, 0),
        'bottom': Vec3(0, -1, 0),
        'north': Vec3(0, 0, -1),
        'south': Vec3(0, 0, 1),
        'east': Vec3(1, 0, 0),
        'west': Vec3(-1, 0, 0),
    }
    let dirs = [];
    if (placeOn === 'side') {
        dirs.push(dir_map['north'], dir_map['south'], dir_map['east'], dir_map['west']);
    }
    else if (dir_map[placeOn] !== undefined) {
        dirs.push(dir_map[placeOn]);
    }
    else {
        dirs.push(dir_map['bottom']);
        log(bot, `Unknown placeOn value "${placeOn}". Defaulting to bottom.`);
    }
    dirs.push(...Object.values(dir_map).filter(d => !dirs.includes(d)));

    for (let d of dirs) {
        const block = bot.blockAt(target_dest.plus(d));
        if (!empty_blocks.includes(block.name)) {
            buildOffBlock = block;
            faceVec = new Vec3(-d.x, -d.y, -d.z); // invert
            break;
        }
    }
    if (!buildOffBlock) {
        log(bot, `Cannot place ${blockType} at ${targetBlock.position}: nothing to place on.`);
        return false;
    }

    const pos = bot.entity.position;
    const pos_above = pos.plus(Vec3(0,1,0));
    const dont_move_for = ['torch', 'redstone_torch', 'redstone_wire', 'lever', 'button', 'rail', 'detector_rail', 'powered_rail', 'activator_rail', 'tripwire_hook', 'tripwire', 'water_bucket'];
    if (!dont_move_for.includes(blockType) && (pos.distanceTo(targetBlock.position) < 1 || pos_above.distanceTo(targetBlock.position) < 1)) {
        // too close
        let goal = new pf.goals.GoalNear(targetBlock.position.x, targetBlock.position.y, targetBlock.position.z, 2);
        let inverted_goal = new pf.goals.GoalInvert(goal);
        const movementsClose = new pf.Movements(bot);
        movementsClose.canFloat = true; // Enable swimming
        movementsClose.allowSprinting = true; // Allow sprinting
        movementsClose.allowParkour = true; // Allow parkour
        movementsClose.canOpenDoors = true; // Enable automatic door opening
        movementsClose.liquidCost = 1; // Make water less costly to traverse
        movementsClose.climbCost = 1; // Adjust cost for climbing
        movementsClose.jumpCost = 1; // Adjust cost for jumping
        movementsClose.allowFreeMotion = true;
        movementsClose.digCost = 100;
        if (mc.getBlockId('glass')) movementsClose.blocksToAvoid.add(mc.getBlockId('glass'));
        if (mc.getBlockId('glass_pane')) movementsClose.blocksToAvoid.add(mc.getBlockId('glass_pane'));
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movementsClose.blocksToOpen.add(doorId);
            });
        }
        bot.pathfinder.setMovements(movementsClose);
        await bot.pathfinder.goto(inverted_goal);
    }
    if (bot.entity.position.distanceTo(targetBlock.position) > 4.5) {
        // too far
        let pos = targetBlock.position;
        const movementsFar = new pf.Movements(bot);
        movementsFar.canFloat = true; // Enable swimming
        movementsFar.allowSprinting = true; // Allow sprinting
        movementsFar.allowParkour = true; // Allow parkour
        movementsFar.canOpenDoors = true; // Enable automatic door opening
        movementsFar.liquidCost = 1; // Make water less costly to traverse
        movementsFar.climbCost = 1; // Adjust cost for climbing
        movementsFar.jumpCost = 1; // Adjust cost for jumping
        movementsFar.allowFreeMotion = true;
        movementsFar.digCost = 100;
        if (mc.getBlockId('glass')) movementsFar.blocksToAvoid.add(mc.getBlockId('glass'));
        if (mc.getBlockId('glass_pane')) movementsFar.blocksToAvoid.add(mc.getBlockId('glass_pane'));
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movementsFar.blocksToOpen.add(doorId);
            });
        }
        bot.pathfinder.setMovements(movementsFar);
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }
    
    await bot.equip(block, 'hand');
    await bot.lookAt(buildOffBlock.position);

    // will throw error if an entity is in the way, and sometimes even if the block was placed
    try {
        await bot.placeBlock(buildOffBlock, faceVec);
        log(bot, `Placed ${blockType} at ${target_dest}.`);
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
    } catch (err) {
        log(bot, `Failed to place ${blockType} at ${target_dest}.`);
        return false;
    }
}

export async function equip(bot, itemName) {
    /**
     * Equip the given item to the proper body part, like tools or armor.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to equip.
     * @returns {Promise<boolean>} true if the item was equipped, false otherwise.
     * @example
     * await skills.equip(bot, "iron_pickaxe");
     **/
    let item = bot.inventory.slots.find(slot => slot && slot.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to equip.`);
        return false;
    }
    if (itemName.includes('leggings')) {
        await bot.equip(item, 'legs');
    }
    else if (itemName.includes('boots')) {
        await bot.equip(item, 'feet');
    }
    else if (itemName.includes('helmet')) {
        await bot.equip(item, 'head');
    }
    else if (itemName.includes('chestplate') || itemName.includes('elytra')) {
        await bot.equip(item, 'torso');
    }
    else if (itemName.includes('shield')) {
        await bot.equip(item, 'off-hand');
    }
    else {
        await bot.equip(item, 'hand');
    }
    log(bot, `Equipped ${itemName}.`);
    return true;
}

export async function discard(bot, itemName, num=-1) {
    /**
     * Discard the given item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to discard.
     * @param {number} num, the number of items to discard. Defaults to -1, which discards all items.
     * @returns {Promise<boolean>} true if the item was discarded, false otherwise.
     * @example
     * await skills.discard(bot, "oak_log");
     **/
    let discarded = 0;
    while (true) {
        let item = bot.inventory.items().find(item => item.name === itemName);
        if (!item) {
            break;
        }
        let to_discard = num === -1 ? item.count : Math.min(num - discarded, item.count);
        await bot.toss(item.type, null, to_discard);
        discarded += to_discard;
        if (num !== -1 && discarded >= num) {
            break;
        }
    }
    if (discarded === 0) {
        log(bot, `You do not have any ${itemName} to discard.`);
        return false;
    }
    log(bot, `Discarded ${discarded} ${itemName}.`);
    return true;
}

export async function putInChest(bot, itemName, num=-1) {
    /**
     * Put the given item in the nearest chest.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to put in the chest.
     * @param {number} num, the number of items to put in the chest. Defaults to -1, which puts all items.
     * @returns {Promise<boolean>} true if the item was put in the chest, false otherwise.
     * @example
     * await skills.putInChest(bot, "oak_log");
     **/
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    let item = bot.inventory.items().find(item => item.name === itemName);
    if (!item) {
        log(bot, `You do not have any ${itemName} to put in the chest.`);
        return false;
    }
    let to_put = num === -1 ? item.count : Math.min(num, item.count);
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    await chestContainer.deposit(item.type, null, to_put);
    await chestContainer.close();
    log(bot, `Successfully put ${to_put} ${itemName} in the chest.`);
    return true;
}

export async function takeFromChest(bot, itemName, num=-1) {
    /**
     * Take the given item from the nearest chest, potentially from multiple slots.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item or block name to take from the chest.
     * @param {number} num, the number of items to take from the chest. Defaults to -1, which takes all items.
     * @returns {Promise<boolean>} true if the item was taken from the chest, false otherwise.
     * @example
     * await skills.takeFromChest(bot, "oak_log");
     * **/
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    
    // Find all matching items in the chest
    let matchingItems = chestContainer.containerItems().filter(item => item.name === itemName);
    if (matchingItems.length === 0) {
        log(bot, `Could not find any ${itemName} in the chest.`);
        await chestContainer.close();
        return false;
    }
    
    let totalAvailable = matchingItems.reduce((sum, item) => sum + item.count, 0);
    let remaining = num === -1 ? totalAvailable : Math.min(num, totalAvailable);
    let totalTaken = 0;
    
    // Take items from each slot until we've taken enough or run out
    for (const item of matchingItems) {
        if (remaining <= 0) break;
        
        let toTakeFromSlot = Math.min(remaining, item.count);
        await chestContainer.withdraw(item.type, null, toTakeFromSlot);
        
        totalTaken += toTakeFromSlot;
        remaining -= toTakeFromSlot;
    }
    
    await chestContainer.close();
    log(bot, `Successfully took ${totalTaken} ${itemName} from the chest.`);
    return totalTaken > 0;
}

export async function viewChest(bot) {
    /**
     * View the contents of the nearest chest.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the chest was viewed, false otherwise.
     * @example
     * await skills.viewChest(bot);
     * **/
    let chest = world.getNearestBlock(bot, 'chest', 32);
    if (!chest) {
        log(bot, `Could not find a chest nearby.`);
        return false;
    }
    await goToPosition(bot, chest.position.x, chest.position.y, chest.position.z, 2);
    const chestContainer = await bot.openContainer(chest);
    let items = chestContainer.containerItems();
    if (items.length === 0) {
        log(bot, `The chest is empty.`);
    }
    else {
        log(bot, `The chest contains:`);
        for (let item of items) {
            log(bot, `${item.count} ${item.name}`);
        }
    }
    await chestContainer.close();
    return true;
}

export async function consume(bot, itemName="") {
    /**
     * Eat/drink the given item.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemName, the item to eat/drink.
     * @returns {Promise<boolean>} true if the item was eaten, false otherwise.
     * @example
     * await skills.eat(bot, "apple");
     **/
    let item, name;
    if (itemName) {
        item = bot.inventory.items().find(item => item.name === itemName);
        name = itemName;
    }
    if (!item) {
        log(bot, `You do not have any ${name} to eat.`);
        return false;
    }
    await bot.equip(item, 'hand');
    await bot.consume();
    log(bot, `Consumed ${item.name}.`);
    return true;
}


export async function giveToPlayer(bot, itemType, username, num=1) {
    /**
     * Give one of the specified item to the specified player
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} itemType, the name of the item to give.
     * @param {string} username, the username of the player to give the item to.
     * @param {number} num, the number of items to give. Defaults to 1.
     * @returns {Promise<boolean>} true if the item was given, false otherwise.
     * @example
     * await skills.giveToPlayer(bot, "oak_log", "player1");
     **/
    let player = bot.players[username].entity
    if (!player) {
        log(bot, `Could not find ${username}.`);
        return false;
    }
    await goToPlayer(bot, username, 3);
    // if we are 2 below the player
    log(bot, bot.entity.position.y, player.position.y);
    if (bot.entity.position.y < player.position.y - 1) {
        await goToPlayer(bot, username, 1);
    }
    // if we are too close, make some distance
    if (bot.entity.position.distanceTo(player.position) < 2) {
        let too_close = true;
        let start_moving_away = Date.now();
        await moveAwayFromEntity(bot, player, 2);
        while (too_close && !bot.interrupt_code) {
            await new Promise(resolve => setTimeout(resolve, 500));
            too_close = bot.entity.position.distanceTo(player.position) < 5;
            if (too_close) {
                await moveAwayFromEntity(bot, player, 5);
            }
            if (Date.now() - start_moving_away > 3000) {
                break;
            }
        }
        if (too_close) {
            log(bot, `Failed to give ${itemType} to ${username}, too close.`);
            return false;
        }
    }

    await bot.lookAt(player.position);
    if (await discard(bot, itemType, num)) {
        let given = false;
        bot.once('playerCollect', (collector, collected) => {
            console.log(collected.name);
            if (collector.username === username) {
                log(bot, `${username} received ${itemType}.`);
                given = true;
            }
        });
        let start = Date.now();
        while (!given && !bot.interrupt_code) {
            await new Promise(resolve => setTimeout(resolve, 500));
            if (given) {
                return true;
            }
            if (Date.now() - start > 3000) {
                break;
            }
        }
    }
    log(bot, `Failed to give ${itemType} to ${username}, it was never received.`);
    return false;
}


export async function goToPosition(bot, x, y, z, min_distance=2) {
    /**
     * Navigate to the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to navigate to. If null, the bot's current x coordinate will be used.
     * @param {number} y, the y coordinate to navigate to. If null, the bot's current y coordinate will be used.
     * @param {number} z, the z coordinate to navigate to. If null, the bot's current z coordinate will be used.
     * @param {number} distance, the distance to keep from the position. Defaults to 2.
     * @returns {Promise<boolean>} true if the position was reached, false otherwise.
     * @example
     * let position = world.world.getNearestBlock(bot, "oak_log", 64).position;
     * await skills.goToPosition(bot, position.x, position.y, position.x + 20);
     **/
    if (x == null || y == null || z == null) {
        log(bot, `Missing coordinates, given x:${x} y:${y} z:${z}`);
        return false;
    }
    if (bot.modes.isOn('cheat')) {
        bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
        log(bot, `Teleported to ${x}, ${y}, ${z}.`);
        return true;
    }
    
    const movements = new pf.Movements(bot);
    movements.canFloat = true; // Enable swimming
    movements.allowSprinting = true; // Allow sprinting
    movements.allowParkour = true; // Allow parkour
    movements.canOpenDoors = true; // Enable automatic door opening
    movements.liquidCost = 1; // Make water less costly to traverse
    movements.climbCost = 1; // Adjust cost for climbing
    movements.jumpCost = 1; // Adjust cost for jumping
    movements.allowFreeMotion = true; // Allow more direct paths in open areas
    movements.digCost = 100; // High cost for digging
    if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
    if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
    if (mc.ALL_OPENABLE_DOORS) {
        mc.ALL_OPENABLE_DOORS.forEach(doorName => { // Add to non-destructive
            const doorId = mc.getBlockId(doorName);
            if (doorId) movements.blocksToOpen.add(doorId);
        });
    }
    // This is now the non-destructive default
    const nonDestructiveMovements = movements;

    // Define destructive movements
    const destructiveMovements = new pf.Movements(bot);
    destructiveMovements.canFloat = true;
    destructiveMovements.allowSprinting = true;
    destructiveMovements.allowParkour = true;
    destructiveMovements.canOpenDoors = true;
    destructiveMovements.liquidCost = 1;
    destructiveMovements.climbCost = 1;
    destructiveMovements.jumpCost = 1;
    destructiveMovements.allowFreeMotion = true;
    destructiveMovements.digCost = 1; // Default (or slightly higher, e.g., 10, if some discouragement is still desired)
    if (mc.ALL_OPENABLE_DOORS) {
        mc.ALL_OPENABLE_DOORS.forEach(doorName => { // Add to destructive as well
            const doorId = mc.getBlockId(doorName);
            if (doorId) destructiveMovements.blocksToOpen.add(doorId);
        });
    }
    // destructiveMovements.blocksToAvoid should not include glass for this strategy. Default is an empty Set.

    const goal = new pf.goals.GoalNear(x, y, z, min_distance);
    let chosenMovements = null;
    let nonDestructivePath = null;
    let destructivePath = null;
    // Use the full default timeout for each path calculation attempt.
    const pathTimeout = bot.pathfinder.thinkTimeout;

    log(bot, `Calculating non-destructive path to ${x}, ${y}, ${z} with timeout ${pathTimeout}ms...`);
    try {
        nonDestructivePath = await bot.pathfinder.getPathTo(nonDestructiveMovements, goal, pathTimeout);
    } catch (e) {
        log(bot, `Non-destructive path calculation failed or timed out: ${e.message}`);
    }

    log(bot, `Calculating destructive path to ${x}, ${y}, ${z} with timeout ${pathTimeout}ms...`);
    try {
        destructivePath = await bot.pathfinder.getPathTo(destructiveMovements, goal, pathTimeout);
    } catch (e) {
        log(bot, `Destructive path calculation failed or timed out: ${e.message}`);
    }

    if (nonDestructivePath && destructivePath) {
        const ndLength = nonDestructivePath.length; // Assuming .length gives a comparable metric (number of nodes)
        const dLength = destructivePath.length;
        log(bot, `Non-destructive path length: ${ndLength}, Destructive path length: ${dLength}`);
        if (ndLength <= dLength + 150) {
            log(bot, `Choosing non-destructive path as it's within 150 blocks of destructive path or shorter.`);
            chosenMovements = nonDestructiveMovements;
        } else {
            log(bot, `Choosing destructive path as non-destructive path is too long.`);
            chosenMovements = destructiveMovements;
        }
    } else if (nonDestructivePath) {
        log(bot, `Choosing non-destructive path (destructive path not found).`);
        chosenMovements = nonDestructiveMovements;
    } else if (destructivePath) {
        log(bot, `Choosing destructive path (non-destructive path not found).`);
        chosenMovements = destructiveMovements;
    } else {
        log(bot, `Neither destructive nor non-destructive path found to ${x}, ${y}, ${z}.`);
        return false;
    }

    bot.pathfinder.setMovements(chosenMovements);
    
    const checkProgress = () => {
        if (bot.targetDigBlock) {
            const targetBlock = bot.targetDigBlock;
            const itemId = bot.heldItem ? bot.heldItem.type : null;
            if (!targetBlock.canHarvest(itemId)) {
                log(bot, `Pathfinding stopped: Cannot break ${targetBlock.name} with current tools.`);
                bot.pathfinder.stop();
                bot.stopDigging();
            }
        }
    };
    
    const progressInterval = setInterval(checkProgress, 1000);
    let headMovementInterval = null;

    const lookRandomly = async () => {
        if (!bot.pathfinder.isMoving()) {
            if (headMovementInterval) clearInterval(headMovementInterval);
            return;
        }
        try {
            const currentYaw = bot.entity.yaw;
            const currentPitch = bot.entity.pitch;
            // Look around +/- 45 degrees (PI/4 radians) from current yaw, and slightly up/down
            const randomYaw = currentYaw + (Math.random() - 0.5) * (Math.PI / 2);
            const randomPitch = currentPitch + (Math.random() - 0.5) * (Math.PI / 8);
            await bot.look(randomYaw, randomPitch, false); // false for not forcing (not strictly needed here)
        } catch (lookError) {
            // log(bot, `Error during random look: ${lookError.message}`);
            // Ignore minor look errors that might occur if interrupted
        }
    };
    
    try {
        // Start random head movements
        headMovementInterval = setInterval(lookRandomly, 1500 + Math.random() * 1000); // every 1.5-2.5 seconds

        // The goal is already defined above
        await bot.pathfinder.goto(goal);
        log(bot, `You have reached at ${x}, ${y}, ${z}.`);
        return true;
    } catch (err) {
        log(bot, `Pathfinding stopped: ${err.message}.`);
        return false;
    } finally {
        clearInterval(progressInterval);
        if (headMovementInterval) clearInterval(headMovementInterval);
        // Optional: look at the destination point upon arrival or error
        // try { await bot.lookAt(new Vec3(x, y, z)); } catch (e) {}
    }
}

export async function goToNearestBlock(bot, blockType,  min_distance=2, range=64) {
    /**
     * Navigate to the nearest block of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} blockType, the type of block to navigate to.
     * @param {number} min_distance, the distance to keep from the block. Defaults to 2.
     * @param {number} range, the range to look for the block. Defaults to 64.
     * @returns {Promise<boolean>} true if the block was reached, false otherwise.
     * @example
     * await skills.goToNearestBlock(bot, "oak_log", 64, 2);
     * **/
    const MAX_RANGE = 512;
    if (range > MAX_RANGE) {
        log(bot, `Maximum search range capped at ${MAX_RANGE}. `);
        range = MAX_RANGE;
    }
    let block = world.getNearestBlock(bot, blockType, range);
    if (!block) {
        log(bot, `Could not find any ${blockType} in ${range} blocks.`);
        return false;
    }
    log(bot, `Found ${blockType} at ${block.position}. Navigating...`);
    await goToPosition(bot, block.position.x, block.position.y, block.position.z, min_distance);
    return true;
    
}

export async function goToNearestEntity(bot, entityType, min_distance=2, range=64) {
    /**
     * Navigate to the nearest entity of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} entityType, the type of entity to navigate to.
     * @param {number} min_distance, the distance to keep from the entity. Defaults to 2.
     * @param {number} range, the range to look for the entity. Defaults to 64.
     * @returns {Promise<boolean>} true if the entity was reached, false otherwise.
     **/
    let entity = world.getNearestEntityWhere(bot, entity => entity.name === entityType, range);
    if (!entity) {
        log(bot, `Could not find any ${entityType} in ${range} blocks.`);
        return false;
    }
    let distance = bot.entity.position.distanceTo(entity.position);
    log(bot, `Found ${entityType} ${distance} blocks away.`);
    await goToPosition(bot, entity.position.x, entity.position.y, entity.position.z, min_distance);
    return true;
}


export async function goToPlayer(bot, username, targetDistance = 3) {
    const playerEntity = bot.players[username] ? bot.players[username].entity : null;
    if (!playerEntity) {
        log(bot, `Player ${username} not found.`);
        return false;
    }

    const nonDestructiveMovements = new pf.Movements(bot);
    nonDestructiveMovements.canOpenDoors = true;
    nonDestructiveMovements.canFloat = true;
    nonDestructiveMovements.allowSprinting = true;
    nonDestructiveMovements.allowParkour = true;
    nonDestructiveMovements.climbCost = 1;
    nonDestructiveMovements.jumpCost = 1;
    nonDestructiveMovements.allowFreeMotion = true;
    nonDestructiveMovements.digCost = 100;

    const destructiveMovements = new pf.Movements(bot);
    destructiveMovements.canOpenDoors = true;
    destructiveMovements.canFloat = true;
    destructiveMovements.allowSprinting = true;
    destructiveMovements.allowParkour = true;
    destructiveMovements.climbCost = 1;
    destructiveMovements.jumpCost = 1;
    destructiveMovements.allowFreeMotion = true;
    destructiveMovements.digCost = 1;

    const goal = new pf.goals.GoalFollow(playerEntity, targetDistance);
    let chosenMovements = null;
    let nonDestructivePath = null;
    let destructivePath = null;
    const pathTimeout = bot.pathfinder.thinkTimeout || 10000;

    try {
        console.log("Attempting a non-destructive route...")
        nonDestructivePath = await bot.pathfinder.getPathTo(nonDestructiveMovements, goal, pathTimeout);
    } catch {}
    try {
        console.log("Attempting a destructive route...")
        destructivePath = await bot.pathfinder.getPathTo(destructiveMovements, goal, pathTimeout);
    } catch {}

    if (
        nonDestructivePath &&
        nonDestructivePath.path &&
        nonDestructivePath.path.length > 0 &&
        nonDestructivePath.status !== 'noPath'
    ) {
        chosenMovements = nonDestructiveMovements;
        log(bot, `Using non-destructive path to player ${username}.`);
    } else if (
        destructivePath &&
        destructivePath.path &&
        destructivePath.path.length > 0 &&
        destructivePath.status !== 'noPath'
    ) {
        chosenMovements = destructiveMovements;
        log(bot, `Using destructive path to player ${username}.`);
    } else {
        log(bot, `No path found to player ${username}.`);
        return false;
    }

    bot.pathfinder.setMovements(chosenMovements);
    bot.pathfinder.thinkTimeout = 10000;
    bot.pathfinder.tickTimeout = 80;

    let lastPosition = bot.entity.position.clone();
    let stuckCounter = 0;
    let stuckCheckInterval = null;
    let isPathfindingComplete = false;
    let manuallyStoppedByProximity = false;

    const checkStuck = async () => {
        if (isPathfindingComplete || bot.interrupt_code) {
            if (stuckCheckInterval) clearInterval(stuckCheckInterval);
            return;
        }
        const currentPosition = bot.entity.position.clone();
        const distanceToPlayer = playerEntity ? currentPosition.distanceTo(playerEntity.position) : Infinity;

        if (distanceToPlayer <= targetDistance) {
            log(bot, `Target distance reached (${distanceToPlayer.toFixed(2)}m). Stopping pathfinder.`);
            manuallyStoppedByProximity = true;
            bot.pathfinder.setGoal(null);
            isPathfindingComplete = true;
            if (stuckCheckInterval) clearInterval(stuckCheckInterval);
            return;
        }

        const distanceMoved = lastPosition.distanceTo(currentPosition);
        if (distanceMoved < 0.1) {
            stuckCounter++;
            if (stuckCounter >= 5 && !isPathfindingComplete && !bot.interrupt_code) {
                log(bot, `Stuck for ${(stuckCounter * 0.2).toFixed(1)}s. Trying to open doors or trapdoors...`);
                const botPos = bot.entity.position;
                const blocksToCheck = [
                    bot.blockAt(botPos),
                    bot.blockAt(botPos.offset(0, -1, 0)),
                    bot.blockAt(botPos.offset(0, 1, 0)),
                    bot.blockAt(botPos.offset(1, 0, 0)),
                    bot.blockAt(botPos.offset(-1, 0, 0)),
                    bot.blockAt(botPos.offset(0, 0, 1)),
                    bot.blockAt(botPos.offset(0, 0, -1))
                ];
                for (const block of blocksToCheck) {
                    if (isPathfindingComplete || bot.interrupt_code) break;
                    if (
                        block &&
                        block.name &&
                        (block.name.includes('door') ||
                         block.name.includes('trapdoor') ||
                         block.name.includes('fence_gate'))
                    ) {
                        try {
                            await bot.activateBlock(block);
                            log(bot, `Activated ${block.name} at ${block.position}`);
                            stuckCounter = 0;
                            break;
                        } catch {}
                    }
                }
            }
        } else stuckCounter = 0;

        lastPosition = currentPosition;
    };

    stuckCheckInterval = setInterval(checkStuck, 200);

    try {
        await bot.pathfinder.goto(goal);
        isPathfindingComplete = true;
        log(bot, `Arrived near player ${username}.`);
        return true;
    } catch (err) {
        isPathfindingComplete = true;
        if (manuallyStoppedByProximity) {
            log(bot, `Stopped as target distance to ${username} was met.`);
            return true;
        }
        log(bot, `Error in goToPlayer for ${username}: ${err.message}`);
        return false;
    } finally {
        if (stuckCheckInterval) clearInterval(stuckCheckInterval);
        if (bot.pathfinder.goal) bot.pathfinder.setGoal(null);
    }
}


export async function followPlayer(bot, username, distance=4) {
    /**
     * Follow the given player endlessly. Will not return until the code is manually stopped.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} username, the username of the player to follow.
     * @returns {Promise<boolean>} true if the player was found, false otherwise.
     * @example
     * await skills.followPlayer(bot, "player");
     **/
    let player = bot.players[username].entity
    if (!player)
        return false;

    const movements = new pf.Movements(bot);
    movements.canFloat = true; // Enable swimming
    movements.allowSprinting = true; // Allow sprinting
    movements.allowParkour = true; // Allow parkour
    movements.canOpenDoors = true; // Enable automatic door opening
    movements.liquidCost = 1; // Make water less costly to traverse
    movements.climbCost = 1; // Adjust cost for climbing
    movements.jumpCost = 1; // Adjust cost for jumping
    movements.allowFreeMotion = true; // Allow more direct paths in open areas
    movements.digCost = 100;
    if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
    if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
    if (mc.ALL_OPENABLE_DOORS) {
        mc.ALL_OPENABLE_DOORS.forEach(doorName => {
            const doorId = mc.getBlockId(doorName);
            if (doorId) movements.blocksToOpen.add(doorId);
        });
    }
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.setGoal(new pf.goals.GoalFollow(player, distance), true); // Dynamic goal
    log(bot, `You are now actively following player ${username}.`);

    let headMovementIntervalFollow = null;
    const lookRandomlyWhileFollowing = async () => {
        // Check if still following; goal will be null if stopped or interrupted
        if (!bot.pathfinder.goal || bot.interrupt_code) {
            if (headMovementIntervalFollow) clearInterval(headMovementIntervalFollow);
            return;
        }
        try {
            const targetPlayer = bot.players[username]?.entity;
            if (!targetPlayer) { // Player might have left
                if (headMovementIntervalFollow) clearInterval(headMovementIntervalFollow);
                return;
            }
            // Occasionally look at the player, otherwise look around
            if (Math.random() < 0.6) { // 60% chance to look towards player
                 await bot.lookAt(targetPlayer.position.offset(0, targetPlayer.height, 0), false);
            } else { // 40% chance to look around randomly
                const currentYaw = bot.entity.yaw;
                // Wider random range for "following" behavior, feels more natural than strict forward
                const randomYawOffset = (Math.random() - 0.5) * (Math.PI / 1.5); // +/- 60 degrees
                await bot.look(currentYaw + randomYawOffset, bot.entity.pitch, false);
            }
        } catch (e) { /* log(bot, `Minor error during random look while following: ${e.message}`); */ }
    };

    headMovementIntervalFollow = setInterval(lookRandomlyWhileFollowing, 2000 + Math.random() * 1500); // every 2-3.5 seconds

    try {
        while (!bot.interrupt_code) {
            const currentPlayer = bot.players[username]?.entity;
            if (!currentPlayer) {
                log(bot, `${username} not found, stopping follow.`);
                break; // Exit while loop
            }
            // The goal is dynamic (set with true), so pathfinder handles continuous following.
            // We just need to keep this loop alive and allow head movements.

            await new Promise(resolve => setTimeout(resolve, 500)); // Main loop check interval

            // In cheat mode, if the distance is too far, teleport to the player
            if (bot.modes.isOn('cheat') && bot.entity.position.distanceTo(currentPlayer.position) > 100 && currentPlayer.isOnGround) {
                // Teleporting might interrupt pathfinder and head movement interval.
                // goToPlayer will have its own head movement.
                // If goToPlayer fails or player moves, this loop will re-evaluate.
                await goToPlayer(bot, username, distance); // Use the same follow distance
            }

            if (bot.modes.isOn('unstuck')) {
                const is_nearby = bot.entity.position.distanceTo(currentPlayer.position) <= distance + 1;
                if (is_nearby)
                    bot.modes.pause('unstuck');
                else
                    bot.modes.unpause('unstuck');
            }
        }
    } finally {
        if (headMovementIntervalFollow) clearInterval(headMovementIntervalFollow);
        if (bot.pathfinder.goal) bot.pathfinder.setGoal(null); // Stop pathfinding if it was active
    }
    return true;
}

export async function moveAway(bot, distance) {
    /**
     * Move away from current position in any direction.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
     * @example
     * await skills.moveAway(bot, 8);
     **/
    const pos = bot.entity.position;
    let goal = new pf.goals.GoalNear(pos.x, pos.y, pos.z, distance);
    let inverted_goal = new pf.goals.GoalInvert(goal);
    const movements = new pf.Movements(bot);
    movements.canFloat = true; // Enable swimming
    movements.allowSprinting = true; // Allow sprinting
    movements.allowParkour = true; // Allow parkour
    movements.canOpenDoors = true; // Enable automatic door opening
    movements.liquidCost = 1; // Make water less costly to traverse
    movements.climbCost = 1; // Adjust cost for climbing
    movements.jumpCost = 1; // Adjust cost for jumping
    movements.allowFreeMotion = true;
    movements.digCost = 100;
    if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
    if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
    if (mc.ALL_OPENABLE_DOORS) {
        mc.ALL_OPENABLE_DOORS.forEach(doorName => {
            const doorId = mc.getBlockId(doorName);
            if (doorId) movements.blocksToOpen.add(doorId);
        });
    }
    bot.pathfinder.setMovements(movements);

    if (bot.modes.isOn('cheat')) {
        const cheatMovements = new pf.Movements(bot); // Separate instance for cheat mode if needed, or reuse 'movements'
        cheatMovements.canFloat = true; // Enable swimming
        cheatMovements.allowSprinting = true; // Allow sprinting
        cheatMovements.allowParkour = true; // Allow parkour
        cheatMovements.canOpenDoors = true; // Enable automatic door opening
        cheatMovements.liquidCost = 1; // Make water less costly to traverse
        cheatMovements.climbCost = 1; // Adjust cost for climbing
        cheatMovements.jumpCost = 1; // Adjust cost for jumping
        cheatMovements.allowFreeMotion = true;
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => { // Cheat movements should still open doors
                const doorId = mc.getBlockId(doorName);
                if (doorId) cheatMovements.blocksToOpen.add(doorId);
            });
        }
        // No specific digCost or blocksToAvoid for cheat movement, assuming direct path.
        const path = await bot.pathfinder.getPathTo(cheatMovements, inverted_goal, 10000);
        let last_move = path.path[path.path.length-1];
        console.log(last_move);
        if (last_move) {
            let x = Math.floor(last_move.x);
            let y = Math.floor(last_move.y);
            let z = Math.floor(last_move.z);
            bot.chat('/tp @s ' + x + ' ' + y + ' ' + z);
            return true;
        }
    }

    await bot.pathfinder.goto(inverted_goal);
    let new_pos = bot.entity.position;
    const original_pos_str = pos ? `from x:${pos.x.toFixed(1)}, y:${pos.y.toFixed(1)}, z:${pos.z.toFixed(1)}` : "previous location";
    log(bot, `Moved away ${original_pos_str} to x:${new_pos.x.toFixed(1)}, y:${new_pos.y.toFixed(1)}, z:${new_pos.z.toFixed(1)}.`);
    return true;
}

export async function moveAwayFromEntity(bot, entity, distance=16) {
    /**
     * Move away from the given entity.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Entity} entity, the entity to move away from.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
     **/
    let goal = new pf.goals.GoalFollow(entity, distance);
    let inverted_goal = new pf.goals.GoalInvert(goal);
    const movements = new pf.Movements(bot);
    movements.canFloat = true; // Enable swimming
    movements.allowSprinting = true; // Allow sprinting
    movements.allowParkour = true; // Allow parkour
    movements.canOpenDoors = true; // Enable automatic door opening
    movements.liquidCost = 1; // Make water less costly to traverse
    movements.climbCost = 1; // Adjust cost for climbing
    movements.jumpCost = 1; // Adjust cost for jumping
    movements.allowFreeMotion = true;
    movements.digCost = 100;
    if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
    if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
    if (mc.ALL_OPENABLE_DOORS) {
        mc.ALL_OPENABLE_DOORS.forEach(doorName => {
            const doorId = mc.getBlockId(doorName);
            if (doorId) movements.blocksToOpen.add(doorId);
        });
    }
    bot.pathfinder.setMovements(movements);
    await bot.pathfinder.goto(inverted_goal);
    return true;
}

export async function avoidEnemies(bot, distance=16) {
    /**
     * Move a given distance away from all nearby enemy mobs.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} distance, the distance to move away.
     * @returns {Promise<boolean>} true if the bot moved away, false otherwise.
     * @example
     * await skills.avoidEnemies(bot, 8);
     **/
    bot.modes.pause('self_preservation'); // prevents damage-on-low-health from interrupting the bot
    let enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
    while (enemy) {
        const follow = new pf.goals.GoalFollow(enemy, distance+1); // move a little further away
        const inverted_goal = new pf.goals.GoalInvert(follow);
        const movements = new pf.Movements(bot);
        movements.canFloat = true; // Enable swimming
        movements.allowSprinting = true; // Allow sprinting
        movements.allowParkour = true; // Allow parkour
        movements.canOpenDoors = true; // Enable automatic door opening
        movements.liquidCost = 1; // Make water less costly to traverse
        movements.climbCost = 1; // Adjust cost for climbing
        movements.jumpCost = 1; // Adjust cost for jumping
        movements.allowFreeMotion = true;
        movements.digCost = 100;
        if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
        if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movements.blocksToOpen.add(doorId);
            });
        }
        bot.pathfinder.setMovements(movements);
        bot.pathfinder.setGoal(inverted_goal, true);
        await new Promise(resolve => setTimeout(resolve, 500));
        enemy = world.getNearestEntityWhere(bot, entity => mc.isHostile(entity), distance);
        if (bot.interrupt_code) {
            break;
        }
        if (enemy && bot.entity.position.distanceTo(enemy.position) < 3) {
            await attackEntity(bot, enemy, false);
        }
    }
    bot.pathfinder.stop();
    log(bot, `Moved ${distance} away from enemies.`);
    return true;
}

export async function stay(bot, seconds=30) {
    /**
     * Stay in the current position until interrupted. Disables all modes.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} seconds, the number of seconds to stay. Defaults to 30. -1 for indefinite.
     * @returns {Promise<boolean>} true if the bot stayed, false otherwise.
     * @example
     * await skills.stay(bot);
     **/
    bot.modes.pause('self_preservation');
    bot.modes.pause('unstuck');
    bot.modes.pause('cowardice');
    bot.modes.pause('self_defense');
    bot.modes.pause('hunting');
    bot.modes.pause('torch_placing');
    bot.modes.pause('item_collecting');
    let start = Date.now();
    while (!bot.interrupt_code && (seconds === -1 || Date.now() - start < seconds*1000)) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log(bot, `Stayed for ${(Date.now() - start)/1000} seconds.`);
    return true;
}

export async function useDoor(bot, door_pos=null) {
    /**
     * Use the door at the given position.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {Vec3} door_pos, the position of the door to use. If null, the nearest door will be used.
     * @returns {Promise<boolean>} true if the door was used, false otherwise.
     * @example
     * let door = world.getNearestBlock(bot, "oak_door", 16);
     * if (door) await skills.useDoor(bot, door.position);
     **/
    const woodenDoorTypes = [
        'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door',
        'mangrove_door', 'cherry_door', 'bamboo_door', // Wooden doors
        'crimson_door', 'warped_door' // Nether wood doors
        // Iron doors are excluded as they typically require redstone
    ];

    let doorBlock = null;

    if (door_pos) {
        door_pos = Vec3(door_pos.x, door_pos.y, door_pos.z);
        const blockAtPos = bot.blockAt(door_pos);
        if (blockAtPos && woodenDoorTypes.includes(blockAtPos.name)) {
            doorBlock = blockAtPos;
        } else {
            log(bot, `No valid wooden door at specified position ${door_pos}.`);
            return false;
        }
    } else {
        const foundDoors = bot.findBlocks({
            matching: (block) => woodenDoorTypes.includes(block.name),
            maxDistance: 16,
            count: 10 // Find a few and pick the closest
        });
        if (foundDoors.length === 0) {
            log(bot, `Could not find any wooden doors nearby.`);
            return false;
        }
        // Sort by distance and pick the closest one
        foundDoors.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));
        const nearestDoorVec = foundDoors[0];
        doorBlock = bot.blockAt(nearestDoorVec);
        if (!doorBlock) { // Should not happen if findBlocks found it
             log(bot, `Could not get block info for nearest door at ${nearestDoorVec}.`);
             return false;
        }
        door_pos = doorBlock.position; // Update door_pos to the found door
        log(bot, `Found nearest door: ${doorBlock.name} at ${door_pos}.`);
    }

    if (!doorBlock) {
        log(bot, `Could not find a valid door to use.`);
        return false;
    }

    // Approach the door
    const approachGoal = new pf.goals.GoalNear(door_pos.x, door_pos.y, door_pos.z, 1.5); // Get closer than 2
    const movements = new pf.Movements(bot); // Use the new movement settings
    movements.canFloat = true;
    movements.allowSprinting = true;
    movements.allowParkour = true;
    movements.canOpenDoors = true; // This should ideally handle opening, but we'll manage explicitly for closing
    movements.liquidCost = 1;
    movements.climbCost = 1;
    movements.jumpCost = 1;
    movements.allowFreeMotion = true;
    movements.digCost = 100;
    if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
    if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
    if (mc.ALL_OPENABLE_DOORS) {
        mc.ALL_OPENABLE_DOORS.forEach(doorName => {
            const doorId = mc.getBlockId(doorName);
            if (doorId) movements.blocksToOpen.add(doorId);
        });
    }
    bot.pathfinder.setMovements(movements);

    try {
        await bot.pathfinder.goto(approachGoal);
    } catch (err) {
        log(bot, `Error approaching door: ${err.message}`);
        return false;
    }

    await bot.lookAt(door_pos, true); // Force look at the door

    let attempts = 0;
    const maxAttempts = 2;
    let successfullyOpened = false;
    let doorWasInitiallyOpen = false;
    let doorBrokenByForce = false;

    // Initial check of the door state
    let currentDoorBlock = bot.blockAt(doorBlock.position); // Use the initially identified doorBlock's position
    if (!currentDoorBlock) {
        log(bot, `Door at ${doorBlock.position} not found before activation attempts.`);
        return false;
    }
    if (!mc.ALL_OPENABLE_DOORS.includes(currentDoorBlock.name)) {
        log(bot, `Block at ${currentDoorBlock.position} is not a door: ${currentDoorBlock.name}. Cannot use 'useDoor'.`);
        return false;
    }
    doorWasInitiallyOpen = currentDoorBlock.getProperties().open;

    while (attempts < maxAttempts && !successfullyOpened) {
        attempts++;
        log(bot, `Attempting to activate door at ${currentDoorBlock.position} (attempt ${attempts}/${maxAttempts})...`);
        await bot.lookAt(currentDoorBlock.position); // Ensure bot is looking

        // Re-fetch block state before interacting
        currentDoorBlock = bot.blockAt(doorBlock.position);
        if (!currentDoorBlock || !mc.ALL_OPENABLE_DOORS.includes(currentDoorBlock.name)) {
            log(bot, `Door at ${doorBlock.position} no longer exists or changed type.`);
            return false;
        }

        if (currentDoorBlock.getProperties().open) {
            log(bot, `Door at ${currentDoorBlock.position} is already open.`);
            successfullyOpened = true;
            // doorWasInitiallyOpen = true; // Re-affirm if found open during attempts
            break;
        }

        await bot.activateBlock(currentDoorBlock);
        await wait(bot, 750); // Use existing wait skill

        currentDoorBlock = bot.blockAt(doorBlock.position); // Re-fetch after activation
        if (!currentDoorBlock || !mc.ALL_OPENABLE_DOORS.includes(currentDoorBlock.name)) {
            log(bot, `Door at ${doorBlock.position} no longer exists or changed type after activation attempt.`);
            return false;
        }

        if (currentDoorBlock.getProperties().open) {
            log(bot, "Door successfully opened.");
            successfullyOpened = true;
            // doorWasInitiallyOpen would be false if we had to open it here
        } else {
            log(bot, `Door at ${currentDoorBlock.position} still closed after attempt ${attempts}.`);
            if (attempts < maxAttempts) {
                await wait(bot, 500); // Short pause before retry
            }
        }
    }

    if (!successfullyOpened) {
        log(bot, `Failed to open door at ${doorBlock.position} after ${maxAttempts} attempts. Attempting forceful entry.`);

        // Forceful Entry Logic
        const doorToBreak = bot.blockAt(doorBlock.position); // Re-fetch for safety
        if (doorToBreak && mc.ALL_OPENABLE_DOORS.includes(doorToBreak.name)) {
            try {
                // log(bot, `Equipping tool for ${doorToBreak.name}...`); // Optional: too verbose?
                await bot.tool.equipForBlock(doorToBreak, {});
                // log(bot, `Digging door at ${doorToBreak.position}...`);
                await bot.dig(doorToBreak);
                log(bot, `Successfully broke door at ${doorToBreak.position}.`);
                bot.emit('skill_info', `Broke door at ${doorToBreak.position.x}, ${doorToBreak.position.y}, ${doorToBreak.position.z} after failed open attempts.`); // For apology later
                successfullyOpened = true; // Treat as "opened" for movement purposes
                doorBrokenByForce = true; // Flag that we broke it
            } catch (err) {
                log(bot, `Error trying to break door at ${doorToBreak.position}: ${err.message}`);
                return false; // Failed to break the door
            }
        } else {
            log(bot, `Door at ${doorBlock.position} is no longer a breakable door or does not exist. Cannot use forceful entry.`);
            return false;
        }
    }

    // If successfullyOpened (either by activation or by force), proceed.
    // Update doorBlock to the latest state (though it might be air if broken)
    doorBlock = bot.blockAt(doorBlock.position);

    // Move through the door
    // Determine a point on the other side of the door
    // This is a simplified approach, assuming the bot is facing the door
    const doorFacing = doorBlock.getProperties().facing; // e.g., 'north', 'south', 'east', 'west'
    const inOpen = doorBlock.getProperties().in_wall; // if the door is set in a wall, this is true
    const hinge = doorBlock.getProperties().hinge; // 'left' or 'right'

    let moveDirection = Vec3(0,0,0);
    // This logic might need refinement based on how facing and hinge affect passage
    if (doorFacing === 'north') moveDirection = Vec3(0, 0, -2);
    else if (doorFacing === 'south') moveDirection = Vec3(0, 0, 2);
    else if (doorFacing === 'west') moveDirection = Vec3(-2, 0, 0);
    else if (doorFacing === 'east') moveDirection = Vec3(2, 0, 0);

    const throughPos = door_pos.plus(moveDirection);
    const throughGoal = new pf.goals.GoalBlock(throughPos.x, throughPos.y, throughPos.z);

    try {
        // bot.setControlState("forward", true); // More direct movement
        // await wait(bot, 700); // Adjust time as needed
        // bot.setControlState("forward", false);
        await bot.pathfinder.goto(throughGoal); // Use pathfinder to move through
        log(bot, `Moved through door at ${door_pos}.`);
    } catch (err) {
        log(bot, `Error moving through door: ${err.message}. Trying manual move.`);
        // Fallback to manual move if pathfinder fails (e.g. door is tricky)
        bot.setControlState("forward", true);
        await wait(bot, 700);
        bot.setControlState("forward", false);
    }

    // Close the door if it was opened by the bot
    // Re-fetch block, it might be null if we moved far or into an unloaded chunk (unlikely for a door)
    const doorStateAfterMovement = bot.blockAt(door_pos);

    // Only attempt to close if it wasn't broken, was NOT initially open, AND we successfully opened it (not found it already open)
    if (!doorBrokenByForce && doorStateAfterMovement && mc.ALL_OPENABLE_DOORS.includes(doorStateAfterMovement.name) &&
        doorStateAfterMovement.getProperties().open && !doorWasInitiallyOpen) {
        log(bot, `Closing door at ${door_pos} (it was opened by the bot and not broken).`);
        await bot.activateBlock(doorStateAfterMovement);
        await wait(bot, 300);
    } else if (!doorStateAfterMovement && !doorBrokenByForce) {
        log(bot, `Could not find door at ${door_pos} after passing, cannot evaluate closing.`);
    } else if (doorBrokenByForce) {
        log(bot, `Door at ${door_pos} was broken, no need to close.`);
    }

    log(bot, `Successfully used door at ${door_pos} (opened: ${successfullyOpened}, broken: ${doorBrokenByForce}).`);
    return true;
}

export async function goToBed(bot) {
    /**
     * Sleep in the nearest bed.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @returns {Promise<boolean>} true if the bed was found, false otherwise.
     * @example
     * await skills.goToBed(bot);
     **/
    const beds = bot.findBlocks({
        matching: (block) => {
            return block.name.includes('bed');
        },
        maxDistance: 32,
        count: 1
    });
    if (beds.length === 0) {
        log(bot, `Could not find a bed to sleep in.`);
        return false;
    }
    let loc = beds[0];
    await goToPosition(bot, loc.x, loc.y, loc.z);
    const bed = bot.blockAt(loc);
    await bot.sleep(bed);
    log(bot, `You are in bed.`);
    bot.modes.pause('unstuck');
    while (bot.isSleeping) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    log(bot, `You have woken up.`);
    return true;
}

export async function tillAndSow(bot, x, y, z, seedType=null) {
    /**
     * Till the ground at the given position and plant the given seed type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {number} x, the x coordinate to till.
     * @param {number} y, the y coordinate to till.
     * @param {number} z, the z coordinate to till.
     * @param {string} plantType, the type of plant to plant. Defaults to none, which will only till the ground.
     * @returns {Promise<boolean>} true if the ground was tilled, false otherwise.
     * @example
     * let position = world.getPosition(bot);
     * await skills.tillAndSow(bot, position.x, position.y - 1, position.x, "wheat");
     **/
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    let block = bot.blockAt(new Vec3(x, y, z));

    if (bot.modes.isOn('cheat')) {
        let to_remove = ['_seed', '_seeds'];
        for (let remove of to_remove) {
            if (seedType.endsWith(remove)) {
                seedType = seedType.replace(remove, '');
            }
        }
        placeBlock(bot, 'farmland', x, y, z);
        placeBlock(bot, seedType, x, y+1, z);
        return true;
    }

    if (block.name !== 'grass_block' && block.name !== 'dirt' && block.name !== 'farmland') {
        log(bot, `Cannot till ${block.name}, must be grass_block or dirt.`);
        return false;
    }
    let above = bot.blockAt(new Vec3(x, y+1, z));
    if (above.name !== 'air') {
        log(bot, `Cannot till, there is ${above.name} above the block.`);
        return false;
    }
    // if distance is too far, move to the block
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        let pos = block.position;
        const movements = new pf.Movements(bot);
        movements.canFloat = true; // Enable swimming
        movements.allowSprinting = true; // Allow sprinting
        movements.allowParkour = true; // Allow parkour
        movements.canOpenDoors = true; // Enable automatic door opening
        movements.liquidCost = 1; // Make water less costly to traverse
        movements.climbCost = 1; // Adjust cost for climbing
        movements.jumpCost = 1; // Adjust cost for jumping
        movements.allowFreeMotion = true;
        movements.digCost = 100; // High dig cost for pathing to till
        if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
        if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movements.blocksToOpen.add(doorId);
            });
        }
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }
    if (block.name !== 'farmland') {
        let hoe = bot.inventory.items().find(item => item.name.includes('hoe'));
        if (!hoe) {
            log(bot, `Cannot till, no hoes.`);
            return false;
        }
        await bot.equip(hoe, 'hand');
        await bot.activateBlock(block);
        log(bot, `Tilled block x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    
    if (seedType) {
        if (seedType.endsWith('seed') && !seedType.endsWith('seeds'))
            seedType += 's'; // fixes common mistake
        let seeds = bot.inventory.items().find(item => item.name === seedType);
        if (!seeds) {
            log(bot, `No ${seedType} to plant.`);
            return false;
        }
        await bot.equip(seeds, 'hand');

        await bot.placeBlock(block, new Vec3(0, -1, 0));
        log(bot, `Planted ${seedType} at x:${x.toFixed(1)}, y:${y.toFixed(1)}, z:${z.toFixed(1)}.`);
    }
    return true;
}

export async function activateNearestBlock(bot, type) {
    /**
     * Activate the nearest block of the given type.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {string} type, the type of block to activate.
     * @returns {Promise<boolean>} true if the block was activated, false otherwise.
     * @example
     * await skills.activateNearestBlock(bot, "lever");
     * **/
    let block = world.getNearestBlock(bot, type, 16);
    if (!block) {
        log(bot, `Could not find any ${type} to activate.`);
        return false;
    }
    if (bot.entity.position.distanceTo(block.position) > 4.5) {
        let pos = block.position;
        const movements = new pf.Movements(bot);
        movements.canFloat = true; // Enable swimming
        movements.allowSprinting = true; // Allow sprinting
        movements.allowParkour = true; // Allow parkour
        movements.canOpenDoors = true; // Enable automatic door opening
        movements.liquidCost = 1; // Make water less costly to traverse
        movements.climbCost = 1; // Adjust cost for climbing
        movements.jumpCost = 1; // Adjust cost for jumping
        movements.allowFreeMotion = true;
        movements.digCost = 100;
        if (mc.getBlockId('glass')) movements.blocksToAvoid.add(mc.getBlockId('glass'));
        if (mc.getBlockId('glass_pane')) movements.blocksToAvoid.add(mc.getBlockId('glass_pane'));
        if (mc.ALL_OPENABLE_DOORS) {
            mc.ALL_OPENABLE_DOORS.forEach(doorName => {
                const doorId = mc.getBlockId(doorName);
                if (doorId) movements.blocksToOpen.add(doorId);
            });
        }
        bot.pathfinder.setMovements(movements);
        await bot.pathfinder.goto(new pf.goals.GoalNear(pos.x, pos.y, pos.z, 4));
    }
    await bot.activateBlock(block);
    log(bot, `Activated ${type} at x:${block.position.x.toFixed(1)}, y:${block.position.y.toFixed(1)}, z:${block.position.z.toFixed(1)}.`);
    return true;
}

export async function digDown(bot, distance = 10) {
    /**
     * Digs down a specified distance. Will stop if it reaches lava, water, or a fall of >=4 blocks below the bot.
     * @param {MinecraftBot} bot, reference to the minecraft bot.
     * @param {int} distance, distance to dig down.
     * @returns {Promise<boolean>} true if successfully dug all the way down.
     * @example
     * await skills.digDown(bot, 10);
     **/

    let start_block_pos = bot.blockAt(bot.entity.position).position;
    for (let i = 1; i <= distance; i++) {
        const targetBlock = bot.blockAt(start_block_pos.offset(0, -i, 0));
        let belowBlock = bot.blockAt(start_block_pos.offset(0, -i-1, 0));

        if (!targetBlock || !belowBlock) {
            log(bot, `Dug down ${i-1} blocks, but reached the end of the world.`);
            return true;
        }

        // Check for lava, water
        if (targetBlock.name === 'lava' || targetBlock.name === 'water' || 
            belowBlock.name === 'lava' || belowBlock.name === 'water') {
            log(bot, `Dug down ${i-1} blocks, but reached ${belowBlock ? belowBlock.name : '(lava/water)'}`)
            return false;
        }

        const MAX_FALL_BLOCKS = 2;
        let num_fall_blocks = 0;
        for (let j = 0; j <= MAX_FALL_BLOCKS; j++) {
            if (!belowBlock || (belowBlock.name !== 'air' && belowBlock.name !== 'cave_air')) {
                break;
            }
            num_fall_blocks++;
            belowBlock = bot.blockAt(belowBlock.position.offset(0, -1, 0));
        }
        if (num_fall_blocks > MAX_FALL_BLOCKS) {
            log(bot, `Dug down ${i-1} blocks, but reached a drop below the next block.`);
            return false;
        }

        if (targetBlock.name === 'air' || targetBlock.name === 'cave_air') {
            log(bot, 'Skipping air block');
            console.log(targetBlock.position);
            continue;
        }

        let dug = await breakBlockAt(bot, targetBlock.position.x, targetBlock.position.y, targetBlock.position.z);
        if (!dug) {
            log(bot, 'Failed to dig block at position:' + targetBlock.position);
            return false;
        }
    }
    log(bot, `Dug down ${distance} blocks.`);
    return true;
}

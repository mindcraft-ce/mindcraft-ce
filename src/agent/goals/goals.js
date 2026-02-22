

export class checklistItem {
    constructor(description) {
        this.description = description;
        this.completed = false;
    }
}


export class Goals  {
    constructor() {
        this.goals = [];
    }


    addGoal(goal, goal_description, priority=1, check_list=[]) {
        this.goals.push({ name: goal, priority: priority, goal_description: goal_description, check_list: check_list});
    }

    setPriority(goal, priority) {
        const goalObj = this.goals.find(g => g.name === goal);
        if (goalObj) {
            goalObj.priority = priority;
        }
    }

    removeGoal(goal) {
        this.goals = this.goals.filter(g => g.name !== goal);
    }

    listGoals() {
        return this.goals;
    }

    getGoal(goalName) {
        return this.goals.find(g => g.name === goalName);
    }

    listFormattedGoal(goalName) {
        const goal = this.getGoal(goalName);
        if (!goal) {
            return `Goal "${goalName}" not found.`;
        }
        let result = `- ${goal.name} (Priority: ${goal.priority}): ${goal.goal_description}\nChecklist:\n`;
        if (goal.check_list.length === 0) {
            result += "  No checklist items.";
        } else {
            goal.check_list.forEach(item => {
                result += `  - [${item.completed ? '(Done)' : '(Not Done)'}] ${item.description}\n`;
            });
        }
        return result;
    }

    markChecklistItem(goalName, itemDescription, completed=true) {
        const goal = this.getGoal(goalName);
        if (!goal) {
            return false;
        }
        const item = goal.check_list.find(i => i.description === itemDescription);
        if (item) {
            item.completed = completed;
            return true;
        }
        return false;
    }

    listFormattedGoals() {
        if (this.goals.length === 0) {
            return "No current goals.";
        }
        return this.goals
            .sort((a, b) => b.priority - a.priority)
            .map(g => `- ${g.name} (Priority: ${g.priority}): ${g.goal_description}`)
            .join('\n');
    }

}
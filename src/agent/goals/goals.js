import { randomUUID } from 'node:crypto';

export class checklistItem {
    constructor(description) {this.description=description;this.completed=false;}
}
export class Goals {
    constructor() {this.goals=[];}
    addGoal(name,goal_description='',priority=1,check_list=[],target=null) {
        const existing=this.getGoal(name);
        if(existing&&existing.status!=='completed') return existing;
        const goal={id:randomUUID(),name,goal_description,priority,check_list,status:'active',target};
        this.goals.push(goal);return goal;
    }
    setPriority(name,priority) {const goal=this.getGoal(name);if(goal) goal.priority=priority;}
    removeGoal(name) {this.goals=this.goals.filter(g=>g.name!==name&&g.id!==name);}
    listGoals() {return this.goals;}
    getGoal(name) {return this.goals.find(g=>g.name===name||g.id===name);}
    complete(name,bot) {
        const goal=this.getGoal(name);
        if(!goal) throw new Error(`Unknown goal: ${name}`);
        if(goal.target) {
            const held=bot?.inventory?.items().filter(i=>i.name===goal.target.item).reduce((n,i)=>n+i.count,0)||0;
            if(held<goal.target.count) throw new Error(`Goal needs ${goal.target.count} ${goal.target.item}; inventory has ${held}`);
        }
        goal.status='completed';return goal;
    }
    active() {return this.goals.filter(g=>g.status==='active');}
    listFormattedGoal(name) {
        const g=this.getGoal(name);
        return g?`${g.name} (${g.status}, priority ${g.priority}): ${g.goal_description}\n${g.check_list.map(i=>`[${i.completed?'x':' '}] ${i.description}`).join('\n')}`:`Goal '${name}' not found.`;
    }
    listFormattedGoals() {return [...this.goals].sort((a,b)=>b.priority-a.priority).map(g=>this.listFormattedGoal(g.id)).join('\n')||'No current goals.';}
    markChecklistItem(name,description,completed=true) {
        const item=this.getGoal(name)?.check_list.find(i=>i.description===description);
        if(item) {item.completed=completed;return true;}return false;
    }
    toJSON() {return structuredClone(this.goals);}
    restore(goals) {
        if(!Array.isArray(goals)) return;
        this.goals=goals.filter(g=>g&&typeof g.name==='string').slice(-100).map(g=>({...g,id:g.id||randomUUID(),
            status:g.status==='completed'?'completed':'active',priority:Number.isFinite(g.priority)?g.priority:1,
            target:g.target&&typeof g.target.item==='string'&&Number.isSafeInteger(g.target.count)&&g.target.count>0?g.target:null,
            check_list:Array.isArray(g.check_list)?g.check_list.filter(i=>i&&typeof i.description==='string'):[]}));
    }
}

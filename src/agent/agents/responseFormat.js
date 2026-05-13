// Brain: routing decision + task planning
export const brainAgentResponseFormat = {
    type: "json_schema",
    name: "brain_agent_response",
    strict: true,
    description: "Brain agent routing decision.",
    schema: {
        "type": "object",
        "properties": {
            "thoughts": {
                "type": "string",
                "description": "Internal reasoning about how to handle this request."
            },
            "route": {
                "type": "string",
                "enum": ["task", "rp"],
                "description": "Where to route: 'task' for game actions, 'rp' for conversation."
            },
            "task_description": {
                "type": "string",
                "description": "Short description of the task for the TaskAgent (when route=task)."
            },
            "task_system_prompt": {
                "type": "string",
                "description": "Detailed system prompt for the TaskAgent with exact plan, materials, coordinates, tool order, strategy (when route=task)."
            },
            "task_action": {
                "type": "string",
                "enum": ["start", "inject", "cancel_and_start"],
                "description": "When a task is running: 'inject' sends context to running task, 'cancel_and_start' stops current and starts new. When no task: 'start'."
            },
            "goal_action": {
                "type": "object",
                "description": "Optional action to manage goals.",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["add", "remove", "set_priority", "mark_checklist_item", "recreate_checklist_item"],
                        "description": "The action to perform on the goals."
                    },
                    "goal": { "type": "string", "description": "The goal name." },
                    "priority": { "type": "integer", "description": "Priority level." },
                    "goal_description": { "type": "string", "description": "Description of the goal." },
                    "checklist": { "type": "array", "items": { "type": "string" }, "description": "Checklist items." },
                    "checklist_item": { "type": "string", "description": "Checklist item description." },
                    "checklist_completed": { "type": "boolean", "description": "Whether the item is completed." }
                },
                "required": ["action", "goal", "priority", "goal_description", "checklist", "checklist_item", "checklist_completed"],
                "additionalProperties": false
            }
        },
        "required": ["thoughts", "route", "task_description", "task_system_prompt", "task_action", "goal_action"],
        "additionalProperties": false
    }
};

// RP: conversational reply
export const rpAgentResponseFormat = {
    type: "json_schema",
    name: "rp_agent_response",
    strict: true,
    description: "RP agent conversational reply.",
    schema: {
        "type": "object",
        "properties": {
            "chat_response": { "type": "string", "description": "Reply to send to the player." },
            "internal_notes": { "type": "string", "description": "Private notes about this player." },
            "relationship_updates": { "type": "string", "description": "Relationship changes (trust, feelings, etc.)." }
        },
        "required": ["chat_response", "internal_notes", "relationship_updates"],
        "additionalProperties": false
    }
};

// Task: step reasoning + completion signal (tools via native function calling)
export const taskAgentResponseFormat = {
    type: "json_schema",
    name: "task_agent_response",
    strict: true,
    description: "Task agent step response.",
    schema: {
        "type": "object",
        "properties": {
            "thought": { "type": "string", "description": "Reasoning about what to do next." },
            "step_report": { "type": "string", "description": "Outcome of the previous action." },
            "work_done": { "type": "boolean", "description": "Whether the task is fully complete." },
            "chat_response": { "type": "string", "description": "Message to send back to the player when done." }
        },
        "required": ["thought", "step_report", "work_done", "chat_response"],
        "additionalProperties": false
    }
};

// Code: augment function body generation
export const codeAgentResponseFormat = {
    type: "json_schema",
    name: "code_agent_response",
    strict: true,
    description: "Code agent augment generation.",
    schema: {
        "type": "object",
        "properties": {
            "thought": { "type": "string", "description": "Reasoning about how to implement the function." },
            "function_body": { "type": "string", "description": "The async function body code." },
            "is_complete": { "type": "boolean", "description": "Whether code generation succeeded." },
            "error_analysis": { "type": "string", "description": "What went wrong, if is_complete is false." }
        },
        "required": ["thought", "function_body", "is_complete", "error_analysis"],
        "additionalProperties": false
    }
};

// Executor: one-shot code execution (same shape as code agent)
export const executorCodeAgentResponseFormat = {
    type: "json_schema",
    name: "executor_code_agent_response",
    strict: true,
    description: "Executor agent one-shot code generation.",
    schema: {
        "type": "object",
        "properties": {
            "thought": { "type": "string", "description": "Reasoning about how to implement the task." },
            "function_body": { "type": "string", "description": "The async function body code to execute." },
            "is_complete": { "type": "boolean", "description": "Whether code generation succeeded." },
            "error_analysis": { "type": "string", "description": "What went wrong, if is_complete is false." }
        },
        "required": ["thought", "function_body", "is_complete", "error_analysis"],
        "additionalProperties": false
    }
};

export const responseFormatSchema = {
    type: "json_schema",
    "json_schema": {
        "name": "agent_response",
        "strict": true,
        "description": "The response from the agent in structured JSON format.",
        "schema": {
            "type": "object",
            "properties": {
                "chat_response": {
                    "type": "string",
                    "description": "The message to send to the user or other agents."
                },
                "work_done": {
                    "type": "boolean",
                    "description": "Indicates whether the assigned work has been completed or if he wants to do more / something else."
                },
                "input_from_user_needed": {
                    "type": "boolean",
                    "description": "Indicates whether the agent needs more input from the user to proceed with his work."
                },
                "next_steps_explained": {
                    "type": "string",
                    "description": "Explanation of the next steps the agent plans to take, to help himself understand what to do next."
                }
            },
            "required": ["chat_response", "work_done"]
        }
    }
};
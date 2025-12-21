// parameters -> CommandParameters(properties) -> getParameters() -> parameters
// properties -> List[CommandProperty]
// CommandProperty(name, description, type, is_required)


class BaseTool {
    constructor(name, description, parameters, is_action = true) {
        this.name = name;
        this.description = description;
        if (parameters && typeof parameters.getParameters === 'function') {
            this.parameters = parameters.getParameters();
        } else {
            this.parameters = parameters || [];
        }

        this.is_action = is_action;
    }

    // method to be overridden by subclasses
    async execute(agent, ...args) {
        throw new Error("Execute method not implemented");
    }
}

export default BaseTool;
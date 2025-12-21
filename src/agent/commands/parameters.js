class CommandParameters {
    constructor(properties) {
        this.parameters = {};
        this.parameters.type = "object";
        this.parameters.properties = {};
        const required = [];
        for (const prop in properties) {
            this.parameters.properties[prop] = properties[prop];
            if (properties[prop].is_required)
                required.push(prop);
        }
        this.parameters.required = required;
    }

    getParameters() {
        return this.parameters;
    }
}

export default CommandParameters;

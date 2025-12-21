class CommandProperty {
    static allowed_types = ['string', 'number', 'integer', 'boolean', 'array', 'object'];

    constructor(name, description, type, is_required = false) {
        this.name = name;
        this.description = description;
        if (!CommandProperty.allowed_types.includes(type)) {
            throw new Error(`Invalid type "${type}" for property "${name}". Allowed types are: ${CommandProperty.allowed_types.join(', ')}`);
        }
        this.type = type;
        this.is_required = is_required;
    }
}

export default CommandProperty;
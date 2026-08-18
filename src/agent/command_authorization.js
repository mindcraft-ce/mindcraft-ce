function normalizeUsers(users) {
    if (users == null) return [];
    if (!Array.isArray(users)) throw new TypeError('Command authorization user lists must be arrays.');
    return users.map(user => String(user).trim()).filter(Boolean);
}

export function isPlayerCommandAuthorized(username, commandName, settings = {}) {
    const user = String(username ?? '').trim();
    if (!user) return false;
    if (settings.allow_public_commands === true) return true;
    if (settings.auth === 'offline' && settings.allow_offline_command_acl !== true) return false;

    const globalUsers = normalizeUsers(settings.command_users);
    if (globalUsers.includes(user)) return true;

    const acl = settings.command_acl;
    if (acl != null) {
        if (typeof acl !== 'object' || Array.isArray(acl)) throw new TypeError('command_acl must be an object keyed by command name.');
        const allowedForCommand = normalizeUsers(acl[commandName]);
        if (allowedForCommand.includes(user)) return true;
    }
    return false;
}

export function commandAuthorizationFailure(username, commandName) {
    return `Player '${username}' is not authorized to execute ${commandName}.`;
}

const RESOURCE_PIVOT_CYCLE = ['any_log', 'cobblestone', 'coal_ore', 'dirt', 'stone'];
const RESOURCE_MISS_RE = /\bNo\s+([\w:-]+)\s+nearby\b|\bCollected\s+0\b/i;

function normalizeResource(raw) {
  if (!raw) return '';
  return raw.toString().replace(/^['"]|['"]$/g, '').trim();
}

export function getHeartbeatResourcePivot(lastHeartbeat) {
  if (!lastHeartbeat || lastHeartbeat.succeeded) return null;
  if (!/^(collectBlocks|searchForBlock)$/.test(lastHeartbeat.command || '')) return null;

  const error = (lastHeartbeat.error || '').toString();
  if (!RESOURCE_MISS_RE.test(error)) return null;

  const failedResource = normalizeResource((lastHeartbeat.streakKey || '').split(':').slice(1).join(':'));
  const failedIndex = RESOURCE_PIVOT_CYCLE.indexOf(failedResource);
  const nextResource = RESOURCE_PIVOT_CYCLE[(failedIndex + 1 + RESOURCE_PIVOT_CYCLE.length) % RESOURCE_PIVOT_CYCLE.length];
  const missBrief = error.slice(0, 80) || `${failedResource || 'resource'} was unavailable`;

  return {
    resource: nextResource,
    hint: `PRIORITY: RESOURCE PIVOT — last heartbeat failed with "${missBrief}". Do NOT retry ${failedResource || 'the same target'} this tick. Try a different resource now: !collectBlocks("${nextResource}", 4).`,
  };
}

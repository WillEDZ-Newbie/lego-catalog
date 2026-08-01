// validation.js — entity, relationship and import validation.
// Lightweight, dependency-free schema checks for persisted entities.

const REQUIRED = {
  world: ['id', 'name', 'status'],
  object: ['id', 'worldId', 'title', 'type'],
  activity: ['id', 'actor', 'type', 'result', 'timestamp'],
  approval: ['id', 'actionType', 'risk', 'status'],
  source: ['id', 'provider', 'authority'],
  location: ['id', 'name']
};

const ENUMS = {
  world_status: ['active', 'archived', 'proposed', 'blocked'],
  world_priority: ['low', 'medium', 'high', 'critical'],
  activity_result: ['success', 'failure', 'partial'],
  approval_risk: ['low', 'medium', 'high', 'critical'],
  approval_status: ['pending', 'approved', 'rejected', 'expired', 'executed', 'failed'],
  source_authority: ['primary', 'mirror', 'reference'],
  source_availability: ['available', 'unavailable', 'unknown']
};

export function validateEntity(kind, entity) {
  const errors = [];
  const required = REQUIRED[kind];
  if (!required) return { valid: false, errors: [`Unknown entity kind: ${kind}`] };
  if (!entity || typeof entity !== 'object') {
    return { valid: false, errors: [`${kind} is not an object`] };
  }
  for (const field of required) {
    if (entity[field] === undefined || entity[field] === null || entity[field] === '') {
      errors.push(`${kind}.${field} is required`);
    }
  }
  if (!entity.schemaVersion) errors.push(`${kind}.schemaVersion is required`);

  // Enum checks
  if (kind === 'world' && entity.status && !ENUMS.world_status.includes(entity.status)) {
    errors.push(`world.status "${entity.status}" is not valid`);
  }
  if (kind === 'world' && entity.priority && !ENUMS.world_priority.includes(entity.priority)) {
    errors.push(`world.priority "${entity.priority}" is not valid`);
  }
  if (kind === 'activity' && entity.result && !ENUMS.activity_result.includes(entity.result)) {
    errors.push(`activity.result "${entity.result}" is not valid`);
  }
  if (kind === 'approval') {
    if (entity.risk && !ENUMS.approval_risk.includes(entity.risk)) errors.push(`approval.risk "${entity.risk}" is not valid`);
    if (entity.status && !ENUMS.approval_status.includes(entity.status)) errors.push(`approval.status "${entity.status}" is not valid`);
  }
  if (kind === 'source' && entity.authority && !ENUMS.source_authority.includes(entity.authority)) {
    errors.push(`source.authority "${entity.authority}" is not valid`);
  }
  return { valid: errors.length === 0, errors };
}

// Relationship validation: objects must point at existing worlds; world objectIds
// and sourceRefs should resolve. Returns a list of relationship problems.
export function validateRelationships(state) {
  const problems = [];
  const worldIds = new Set(state.worlds.map(w => w.id));
  const sourceIds = new Set(state.sources.map(s => s.id));

  for (const obj of state.objects) {
    if (obj.worldId && !worldIds.has(obj.worldId)) {
      problems.push({ kind: 'object', id: obj.id, issue: `references missing world ${obj.worldId}` });
    }
    if (obj.sourceRef && !sourceIds.has(obj.sourceRef)) {
      problems.push({ kind: 'object', id: obj.id, issue: `references missing source ${obj.sourceRef}` });
    }
  }
  for (const world of state.worlds) {
    for (const ref of world.sourceRefs || []) {
      if (!sourceIds.has(ref)) {
        problems.push({ kind: 'world', id: world.id, issue: `references missing source ${ref}` });
      }
    }
  }
  return problems;
}

export function validateImport(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { valid: false, errors: ['Import payload is not an object'] };
  if (!payload.kind || payload.kind !== 'void-dominion-export') {
    errors.push('Import is missing kind "void-dominion-export"');
  }
  if (!payload.schemaVersion) errors.push('Import is missing schemaVersion');
  if (!payload.data || typeof payload.data !== 'object') errors.push('Import is missing data');
  return { valid: errors.length === 0, errors };
}

// Stable, non-cryptographic ID generator. Deterministic prefix + counter + time.
let _counter = 0;
export function generateId(prefix = 'id') {
  _counter += 1;
  const t = Date.now().toString(36);
  const c = _counter.toString(36);
  const r = Math.floor((performance.now() % 1) * 1e6).toString(36);
  return `${prefix}-${t}${c}${r}`;
}

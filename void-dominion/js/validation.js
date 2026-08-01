// validation.js — entity, relationship and import validation.
// Pure functions with no DOM or storage dependency so they can be unit-tested
// in Node as well as the browser.

export const CURRENT_SCHEMA_VERSION = '1.0';

const REQUIRED = {
  world: ['id', 'name', 'status'],
  object: ['id', 'worldId', 'title', 'type'],
  room: ['id', 'worldId', 'name'],
  activity: ['id', 'actor', 'type', 'result', 'timestamp'],
  approval: ['id', 'actionType', 'risk', 'status'],
  source: ['id', 'provider', 'authority'],
};

const ENUMS = {
  world: { status: ['active', 'archived', 'proposed', 'blocked'] },
  object: { stage: ['draft', 'final', 'reference', 'superseded'] },
  activity: { result: ['success', 'failure', 'partial'] },
  approval: {
    risk: ['low', 'moderate', 'medium', 'high', 'critical'],
    status: ['pending', 'approved', 'rejected', 'expired', 'executed', 'failed'],
  },
  source: {
    authority: ['primary', 'mirror', 'reference'],
    availability: ['available', 'unavailable', 'unknown'],
    writeCapability: ['none', 'proposed', 'approved'],
  },
};

// Validate a single entity of a given type.
// Returns { valid: boolean, errors: string[] }.
export function validateEntity(type, entity) {
  const errors = [];
  if (!entity || typeof entity !== 'object') {
    return { valid: false, errors: [`${type} must be an object`] };
  }
  const required = REQUIRED[type];
  if (!required) {
    return { valid: false, errors: [`Unknown entity type: ${type}`] };
  }
  for (const field of required) {
    const v = entity[field];
    if (v === undefined || v === null || v === '') {
      errors.push(`${type}.${field} is required`);
    }
  }
  if (!entity.schemaVersion) {
    errors.push(`${type}.schemaVersion is required`);
  }
  const enums = ENUMS[type] || {};
  for (const [field, allowed] of Object.entries(enums)) {
    const v = entity[field];
    if (v !== undefined && v !== null && v !== '' && !allowed.includes(v)) {
      errors.push(`${type}.${field} must be one of: ${allowed.join(', ')} (got "${v}")`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Validate referential relationships across a full dataset.
export function validateRelationships(data) {
  const errors = [];
  const worldIds = new Set((data.worlds || []).map((w) => w.id));
  const roomIds = new Set((data.rooms || []).map((r) => r.id));

  for (const obj of data.objects || []) {
    if (obj.worldId && !worldIds.has(obj.worldId)) {
      errors.push(`object ${obj.id} references missing world ${obj.worldId}`);
    }
    if (obj.roomId && !roomIds.has(obj.roomId)) {
      errors.push(`object ${obj.id} references missing room ${obj.roomId}`);
    }
  }
  for (const room of data.rooms || []) {
    if (room.worldId && !worldIds.has(room.worldId)) {
      errors.push(`room ${room.id} references missing world ${room.worldId}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// Validate a full import/export payload before it enters application state.
export function validateDataset(data) {
  const errors = [];
  const collections = {
    world: data.worlds,
    room: data.rooms,
    object: data.objects,
    activity: data.activity,
    source: data.sources,
  };
  for (const [type, list] of Object.entries(collections)) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`${type} collection must be an array`);
      continue;
    }
    list.forEach((entity, i) => {
      const res = validateEntity(type, entity);
      if (!res.valid) errors.push(`${type}[${i}]: ${res.errors.join('; ')}`);
    });
  }
  const rel = validateRelationships({
    worlds: data.worlds || [],
    rooms: data.rooms || [],
    objects: data.objects || [],
  });
  errors.push(...rel.errors);
  return { valid: errors.length === 0, errors };
}

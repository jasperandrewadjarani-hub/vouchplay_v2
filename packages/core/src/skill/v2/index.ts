/**
 * STS_V2 - rig-resistant Community Skill engine (master_plan §2AF). Pure, deterministic,
 * framework-free. V1 (`vouches/`) is untouched and keeps running; this is an additive, versioned,
 * side-by-side algorithm (`algorithmVersion: 'STS_V2'`) so it can be shadow-computed, reviewed, and
 * flipped on/off via one Admin setting without a deploy.
 */
export * from './types';
export * from './trust';
export * from './independence';
export * from './compute';
export * from './anomalies';

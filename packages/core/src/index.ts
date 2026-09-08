/**
 * @vouchplay/core - domain services (handover §34.4). Business logic lives HERE, not in React
 * components or API route handlers. Domains to be implemented in phase order:
 *   auth · players · vouches (STS engine) · clubs · tournaments · registration ·
 *   tournament-exports · payments · notifications · moderation · admin · analytics.
 *
 * Scaffold placeholder - modules added per phase.
 */
export const CORE_PACKAGE = '@vouchplay/core';

export * from './notifications/email';
export * from './notifications/catalog';
export * from './vouches';
export * from './eligibility';
export * from './payments/provider';
export * from './analytics/summary';
export * from './contribution/contrib';
export * from './leaderboards/leader';
export * from './leaderboards/eligibility';
export * from './tournaments/default-divisions';
export * from './tournaments/demand-interest';
export * from './tournaments/demand-division-key';
export * from './tournaments/cover';
export * from './tournaments/lifecycle';
export * from './tournaments/retention';
export * from './tournaments/skill-floor';
export * from './offers/lifecycle';
export * from './offers/targeting';
export * from './time/ph-time';

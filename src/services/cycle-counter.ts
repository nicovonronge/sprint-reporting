import type { StatusTransition } from '../types/metrics.js';
import { DEV_CYCLE_STATUS, QA_CYCLE_STATUS } from '../constants/workflow.js';

export function countDevCycles(transitions: StatusTransition[]): number {
  return transitions.filter(t => t.toStatus === DEV_CYCLE_STATUS).length;
}

export function countQaCycles(transitions: StatusTransition[]): number {
  return transitions.filter(t => t.toStatus === QA_CYCLE_STATUS).length;
}

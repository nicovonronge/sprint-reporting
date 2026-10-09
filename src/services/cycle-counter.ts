import type { StatusTransition } from '../types/metrics.js';
import { DEV_CYCLE_STATUS, QA_CYCLE_STATUS } from '../constants/workflow.js';

interface CycleWindow {
  start?: string;
  end?: string;
}

// Only transitions inside the window count, so rework from earlier sprints isn't re-reported.
function inWindow(t: StatusTransition, window?: CycleWindow): boolean {
  const ts = Date.parse(t.timestamp);
  if (window?.start && ts < Date.parse(window.start)) return false;
  if (window?.end && ts > Date.parse(window.end)) return false;
  return true;
}

export function countDevCycles(transitions: StatusTransition[], window?: CycleWindow): number {
  return transitions.filter(t => t.toStatus === DEV_CYCLE_STATUS && inWindow(t, window)).length;
}

export function countQaCycles(transitions: StatusTransition[], window?: CycleWindow): number {
  return transitions.filter(t => t.toStatus === QA_CYCLE_STATUS && inWindow(t, window)).length;
}

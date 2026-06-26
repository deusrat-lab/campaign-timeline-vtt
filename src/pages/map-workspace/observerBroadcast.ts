/**
 * BroadcastChannel sync skeleton between the DM's MapWorkspacePage tab and
 * the standalone Observer tab/window (Etap C). Kept as a tiny, dependency-
 * free module so both pages import the exact same channel name and message
 * shape. BroadcastChannel only works across same-origin tabs/windows in the
 * same browser — that's the whole intended use case here (DM laptop + a
 * second screen/TV opened from the same browser/profile).
 *
 * The DM-side sender (postObserverFocus) is NOT yet wired into
 * MapWorkspacePage's render — this is intentionally left as the safe MVP
 * subset (per the task's priority order, "at minimum build the Observer
 * renderer + channel listener so a later pass can wire the sender"). Wiring
 * it later just means calling postObserverFocus(...) from MapWorkspacePage
 * wherever the DM's timeline/scope/selection changes.
 */

export const OBSERVER_CHANNEL_NAME = 'campaign-timeline-vtt:observer';

export interface ObserverBroadcastMessage {
  timelineId: string;
  scope: 'kingdom' | 'region' | 'city';
  selectedLocationStateId?: string;
  focusPoint?: { x: number; y: number };
  cameraView?: { scale: number; x: number; y: number };
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(OBSERVER_CHANNEL_NAME);
  return channel;
}

/** Call from the DM side (MapWorkspacePage) whenever the DM's
 * timeline/scope/selection/camera changes, to push Observer to follow along. */
export function postObserverFocus(message: ObserverBroadcastMessage): void {
  getChannel()?.postMessage(message);
}

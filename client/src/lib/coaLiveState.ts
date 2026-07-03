// Lightweight module-level store so the COA overlay can "see" live Conference
// Room state without prop-drilling through the browser view's internal state.

export interface COAPanelState {
  label: string;
  url: string;
  status: string;
  blocked: boolean;
}

export interface COAConferenceState {
  panels: COAPanelState[];
  log: string[];
  updatedAt: number;
}

let conferenceState: COAConferenceState | null = null;

export function setConferenceState(s: COAConferenceState) {
  conferenceState = s;
}

export function getConferenceState(): COAConferenceState | null {
  return conferenceState;
}

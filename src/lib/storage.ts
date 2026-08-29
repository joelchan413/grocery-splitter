import { Household, Trip } from '@/types';

export const DEFAULT_HOUSEHOLD: Household = {
  id: 'household-default',
  name: 'Apartment 4B',
  participants: [
    { id: 'p1', name: 'Joel', avatarEmoji: '🛒', color: '#2563EB', venmoHandle: '@joel' },
    { id: 'p2', name: 'Alex', avatarEmoji: '🥑', color: '#059669', venmoHandle: '@alex' },
    { id: 'p3', name: 'Sam', avatarEmoji: '🧀', color: '#D97706', venmoHandle: '@sam' },
    { id: 'p4', name: 'Jordan', avatarEmoji: '☕', color: '#7C3AED', venmoHandle: '@jordan' },
  ],
};

const STORAGE_KEYS = {
  HOUSEHOLD: 'grocery_splitter_household_v1',
  HOUSEHOLD_INITIALIZED: 'grocery_splitter_household_init_v1',
  ACTIVE_TRIP: 'grocery_splitter_active_trip_v1',
  TRIP_HISTORY: 'grocery_splitter_trip_history_v1',
  GEMINI_API_KEY: 'grocery_splitter_gemini_key_v1',
  AI_MODEL: 'grocery_splitter_ai_model_v1',
  ACTIVE_PARTICIPANT_ID: 'grocery_splitter_active_participant_v1',
};

export const AVAILABLE_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', desc: 'Latest, fastest & highest OCR accuracy', isDefault: true },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Next-gen multimodal reasoning' },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', desc: 'Balanced speed and vision precision' },
  { id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', desc: 'Fast multimodal structured extraction' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', desc: 'High efficiency vision model' },
] as const;

export function loadSelectedAiModel(): string {
  if (typeof window === 'undefined') return 'gemini-3.7-flash';
  return localStorage.getItem(STORAGE_KEYS.AI_MODEL) || 'gemini-3.7-flash';
}

export function saveSelectedAiModel(model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.AI_MODEL, model);
}

export function isHouseholdInitialized(): boolean {
  if (typeof window === 'undefined') return true;
  return Boolean(localStorage.getItem(STORAGE_KEYS.HOUSEHOLD_INITIALIZED));
}

export function setHouseholdInitialized(val: boolean = true): void {
  if (typeof window === 'undefined') return;
  if (val) {
    localStorage.setItem(STORAGE_KEYS.HOUSEHOLD_INITIALIZED, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEYS.HOUSEHOLD_INITIALIZED);
  }
}

export function loadHousehold(): Household {
  if (typeof window === 'undefined') return DEFAULT_HOUSEHOLD;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HOUSEHOLD);
    if (!raw) return DEFAULT_HOUSEHOLD;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading household from localStorage:', e);
    return DEFAULT_HOUSEHOLD;
  }
}

export function saveHousehold(household: Household): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.HOUSEHOLD, JSON.stringify(household));
  } catch (e) {
    console.error('Error saving household to localStorage:', e);
  }
}

export function loadActiveTrip(): Trip | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_TRIP);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading active trip:', e);
    return null;
  }
}

export function saveActiveTrip(trip: Trip | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (trip) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_TRIP, JSON.stringify(trip));
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_TRIP);
    }
  } catch (e) {
    console.error('Error saving active trip:', e);
  }
}

export function loadTripHistory(): Trip[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TRIP_HISTORY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading trip history:', e);
    return [];
  }
}

export function archiveTrip(trip: Trip): void {
  if (typeof window === 'undefined') return;
  try {
    const history = loadTripHistory();
    const existingIndex = history.findIndex((t) => t.id === trip.id);
    if (existingIndex >= 0) {
      history[existingIndex] = trip;
    } else {
      history.unshift(trip);
    }
    localStorage.setItem(STORAGE_KEYS.TRIP_HISTORY, JSON.stringify(history));
  } catch (e) {
    console.error('Error archiving trip:', e);
  }
}

export function loadGeminiApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '';
}

export function saveGeminiApiKey(key: string): void {
  if (typeof window === 'undefined') return;
  if (key) {
    localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, key);
  } else {
    localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
  }
}

export function loadActiveParticipantId(): string {
  if (typeof window === 'undefined') return 'p1';
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PARTICIPANT_ID) || 'p1';
}

export function saveActiveParticipantId(id: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PARTICIPANT_ID, id);
}

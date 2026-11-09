export type EmotionType =
  | 'happy'
  | 'excited'
  | 'tsukkomi'
  | 'laugh'
  | 'surprise'
  | 'worry'
  | 'smug'
  | 'neutral';

export interface ChatMessage {
  id: string;
  sender: 'streamer' | 'tetena';
  text: string;
  subtitleText?: string;
  emotion?: EmotionType;
  audioBase64?: string | null;
  timestamp: number;
  tsukkomiScore?: number;
}

export type ToneStyle = 'tsukkomi' | 'energetic' | 'healing' | 'sassy' | 'hardcore';

export interface GameContext {
  gameTitle: string;
  currentSituation: string;
  toneStyle: ToneStyle;
}

export interface ObsSettings {
  backgroundMode: 'transparent' | 'green' | 'magenta' | 'dark';
  subtitlePosition: 'bubble' | 'bottom' | 'side';
  showStreamerSpeech: boolean;
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  avatarScale: number;
  playAudioInOverlay: boolean;
}

export interface TetenaSyncEvent {
  type: 'NEW_REPLY' | 'SPEAKING_STATE' | 'SETTINGS_UPDATE' | 'STREAMER_TALKING';
  payload: any;
}

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: number;
}

export interface ApiStatusInfo {
  activeEngine: 'Gemini' | 'LOCAL_FALLBACK' | string;
  modelUsed: string;
  errorType?: 'NONE' | 'QUOTA_EXCEEDED' | 'RATE_LIMIT' | 'NETWORK_ERROR' | 'API_ERROR' | string;
  errorMessage?: string;
  retryInSeconds?: number;
}


/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Tv,
  Gamepad2,
  Volume2,
  Radio,
  ExternalLink,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ChatMessage, EmotionType, GameContext, ObsSettings, ToneStyle, MemoryItem, ApiStatusInfo } from './types';
import { TetenaAvatar } from './components/TetenaAvatar';
import { SubtitleBar } from './components/SubtitleBar';
import { ControlPanel } from './components/ControlPanel';
import { ObsOverlayView } from './components/ObsOverlayView';
import { audioPlayer } from './utils/audioPlayer';
import { speechRecognizer } from './utils/speechRecognition';
import { AivisSpeechChecker } from './components/AivisSpeechChecker';
import { synthesizeAivisAudio } from './utils/aivisSpeech';

const DEFAULT_GAME_CONTEXT: GameContext = {
  gameTitle: 'おまかせ・自動認識',
  currentSituation: '何でも気軽に雑談＆プレイ中',
  toneStyle: 'tsukkomi',
};

const DEFAULT_OBS_SETTINGS: ObsSettings = {
  backgroundMode: 'transparent',
  subtitlePosition: 'bubble',
  showStreamerSpeech: true,
  fontSize: 'lg',
  avatarScale: 1.1,
  playAudioInOverlay: true,
};

export default function App() {
  // Check if opened as dedicated OBS Browser Source view via ?mode=obs
  const [isObsUrlMode] = useState(() => {
    return new URLSearchParams(window.location.search).get('mode') === 'obs';
  });

  const [activeView, setActiveView] = useState<'dashboard' | 'obs'>(
    isObsUrlMode ? 'obs' : 'dashboard'
  );

  // States
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [currentSubtitle, setCurrentSubtitle] = useState<string>(
    'クマ様、実況準備完了だよ！一緒に配信盛り上げていこうね！'
  );
  const [streamerSubtitle, setStreamerSubtitle] = useState<string>('');
  const [currentEmotion, setCurrentEmotion] = useState<EmotionType>('happy');
  const [tsukkomiScore, setTsukkomiScore] = useState<number>(1);

  // Persistent Chat History
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('tetena_chat_history_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed.slice(-30);
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      const toSave = chatHistory.slice(-30).map((msg) => ({
        ...msg,
        audioBase64: null, // do not store heavy audio payloads in localStorage
      }));
      localStorage.setItem('tetena_chat_history_v2', JSON.stringify(toSave));
    } catch (e) {
      console.warn('Failed to save chat history:', e);
    }
  }, [chatHistory]);

  // Persistent Game Context
  const [gameContext, setGameContext] = useState<GameContext>(() => {
    try {
      const saved = localStorage.getItem('tetena_game_context_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.gameTitle === 'モンスターハンター' && parsed.currentSituation === '通常クエスト中') {
          return DEFAULT_GAME_CONTEXT;
        }
        return { ...DEFAULT_GAME_CONTEXT, ...parsed };
      }
    } catch (e) {
      console.warn('Failed to load gameContext:', e);
    }
    return DEFAULT_GAME_CONTEXT;
  });

  useEffect(() => {
    try {
      localStorage.setItem('tetena_game_context_v2', JSON.stringify(gameContext));
    } catch (e) {
      console.warn('Failed to save gameContext:', e);
    }
  }, [gameContext]);

  // Lightweight Long-term Memory
  const [memories, setMemories] = useState<MemoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('tetena_long_term_memories_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load memories:', e);
    }
    return [
      { id: 'mem-1', content: '相棒（配信者）の呼び名は「クマ様」', createdAt: Date.now() },
      { id: 'mem-2', content: 'ゲーム・犬・猫・バイク・日常の話題が大好き', createdAt: Date.now() },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('tetena_long_term_memories_v1', JSON.stringify(memories));
    } catch (e) {
      console.warn('Failed to save memories:', e);
    }
  }, [memories]);

  const handleAddMemory = (content: string) => {
    if (!content.trim()) return;
    const newItem: MemoryItem = {
      id: 'mem-' + Date.now(),
      content: content.trim(),
      createdAt: Date.now(),
    };
    setMemories((prev) => [...prev, newItem]);
  };

  const handleEditMemory = (id: string, newContent: string) => {
    setMemories((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: newContent.trim() } : m))
    );
  };

  const handleDeleteMemory = (id: string) => {
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  // Detailed API status tracking (modelUsed, error differentiation)
  const [apiStatus, setApiStatus] = useState<ApiStatusInfo>({
    activeEngine: 'Gemini',
    modelUsed: 'gemini-3.1-flash-lite',
    errorType: 'NONE',
  });

  const [obsSettings, setObsSettings] = useState<ObsSettings>(DEFAULT_OBS_SETTINGS);
  const [volume, setVolume] = useState(1.0);
  const [voiceName, setVoiceName] = useState('Kore');
  const [serverStatus, setServerStatus] = useState<{ hasApiKey: boolean; companion: string } | null>(null);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const [isUsingBrowserAudio, setIsUsingBrowserAudio] = useState(false);
  const [isOfflineEngine, setIsOfflineEngine] = useState(false);

  // BroadcastChannel for syncing Controller window with separate OBS Browser Source tab
  const channelRef = useRef<BroadcastChannel | null>(null);
  const isChannelOpenRef = useRef<boolean>(false);
  const obsSettingsRef = useRef(obsSettings);
  useEffect(() => {
    obsSettingsRef.current = obsSettings;
  }, [obsSettings]);

  // Listener setup for BroadcastChannel messages
  const attachChannelListener = useCallback((channel: BroadcastChannel) => {
    channel.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === 'NEW_REPLY') {
        setCurrentSubtitle(payload.replyText || '');
        setCurrentEmotion(payload.emotion || 'happy');
        setTsukkomiScore(payload.tsukkomiScore || 1);
        if (payload.streamerText) {
          setStreamerSubtitle(payload.streamerText);
        }

        // If in OBS mode and audio is provided, play audio in overlay if enabled
        if (isObsUrlMode && payload.audioBase64 && obsSettingsRef.current.playAudioInOverlay) {
          audioPlayer.playWavBase64(payload.audioBase64).catch(() => {});
        } else if (isObsUrlMode && payload.fallbackToBrowserTTS && obsSettingsRef.current.playAudioInOverlay) {
          audioPlayer.speakBrowserFallback(payload.replyText).catch(() => {});
        }
      } else if (type === 'STREAMER_TALKING') {
        setStreamerSubtitle(payload.text || '');
      } else if (type === 'SPEAKING_STATE') {
        setIsSpeaking(payload.speaking);
      } else if (type === 'SETTINGS_UPDATE') {
        setObsSettings((prev) => ({ ...prev, ...payload }));
      }
    };
  }, [isObsUrlMode]);

  // Ensure BroadcastChannel is open and initialize/re-initialize if closed
  const getOpenChannel = useCallback((): BroadcastChannel | null => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
    try {
      if (!channelRef.current || !isChannelOpenRef.current) {
        const newChannel = new BroadcastChannel('tetena_channel');
        attachChannelListener(newChannel);
        channelRef.current = newChannel;
        isChannelOpenRef.current = true;
      }
      return channelRef.current;
    } catch (err) {
      console.warn('Failed to ensure BroadcastChannel:', err);
      isChannelOpenRef.current = false;
      return null;
    }
  }, [attachChannelListener]);

  // Safe postMessage wrapper that verifies channelRef.current is not null and channel is in an open state
  const safePostMessage = useCallback(
    (data: any) => {
      if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
      try {
        // Ensure channel is initialized and open
        if (!channelRef.current || !isChannelOpenRef.current) {
          const freshChannel = new BroadcastChannel('tetena_channel');
          attachChannelListener(freshChannel);
          channelRef.current = freshChannel;
          isChannelOpenRef.current = true;
        }

        // Verify channelRef.current is not null and channel is open before sending
        if (channelRef.current !== null && isChannelOpenRef.current) {
          channelRef.current.postMessage(data);
        }
      } catch (err) {
        console.warn('BroadcastChannel was closed or failed. Re-initializing...', err);
        try {
          isChannelOpenRef.current = false;
          const freshChannel = new BroadcastChannel('tetena_channel');
          attachChannelListener(freshChannel);
          channelRef.current = freshChannel;
          isChannelOpenRef.current = true;

          // Verify channelRef.current is not null and channel is open before retrying
          if (channelRef.current !== null && isChannelOpenRef.current) {
            channelRef.current.postMessage(data);
          }
        } catch (retryErr) {
          console.warn('BroadcastChannel retry failed:', retryErr);
          isChannelOpenRef.current = false;
        }
      }
    },
    [attachChannelListener]
  );

  // Register Audio Player callbacks for lip-sync and speaking state
  useEffect(() => {
    audioPlayer.setCallbacks(
      (level) => setVolumeLevel(level),
      (speaking) => {
        setIsSpeaking(speaking);
        // Sync speaking state across windows safely
        if (channelRef.current !== null && isChannelOpenRef.current) {
          safePostMessage({
            type: 'SPEAKING_STATE',
            payload: { speaking },
          });
        }
      }
    );
  }, [safePostMessage]);

  // Fetch server status on mount
  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        setServerStatus(data);
        if (data.ttsQuotaExhausted) {
          setIsUsingBrowserAudio(true);
        }
        if (data.chatQuotaExhausted) {
          setIsOfflineEngine(true);
        }
      })
      .catch((err) => console.warn('Status check warning:', err));
  }, []);

  // BroadcastChannel setup for multi-window OBS synchronization
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

    let channel = channelRef.current;
    try {
      if (!channel || !isChannelOpenRef.current) {
        channel = new BroadcastChannel('tetena_channel');
        channelRef.current = channel;
        isChannelOpenRef.current = true;
      }
      attachChannelListener(channel);
    } catch (e) {
      console.warn('Failed to initialize BroadcastChannel in useEffect:', e);
      isChannelOpenRef.current = false;
    }

    return () => {
      isChannelOpenRef.current = false;
      if (channel) {
        try {
          channel.close();
        } catch (_) {}
      }
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [attachChannelListener]);

  // Core handler: Send message to Tetena-chan (Streamer speech or quick action)
  const handleSendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || isLoading) return;

      setIsLoading(true);
      setStreamerSubtitle(messageText);

      // Notify OBS overlay of streamer's text safely if channel is available and open
      if (channelRef.current !== null && isChannelOpenRef.current) {
        safePostMessage({
          type: 'STREAMER_TALKING',
          payload: { text: messageText },
        });
      }

      const streamerMsg: ChatMessage = {
        id: 'msg-' + Date.now(),
        sender: 'streamer',
        text: messageText,
        timestamp: Date.now(),
      };
      setChatHistory((prev) => [...prev, streamerMsg]);

      // 環境判定: Windows PC等のローカル実行環境 (localhost / 127.0.0.1) かどうかを安全に判定
      const isLocalEnvironment =
        typeof window !== 'undefined' &&
        Boolean(
          window.location.hostname === 'localhost' ||
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname === '0.0.0.0'
        );

      try {
        const response = await fetch('/api/talk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: messageText,
            history: chatHistory.slice(-8).map((m) => ({
              role: m.sender === 'streamer' ? 'user' : 'model',
              text: m.text,
            })),
            gameTitle: gameContext.gameTitle,
            currentSituation: gameContext.currentSituation,
            toneStyle: gameContext.toneStyle,
            voiceName,
            skipServerTTS: isLocalEnvironment,
            memories: memories.map((m) => m.content),
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${response.status} エラー`);
        }

        const data = await response.json();

        if (data.apiStatus) {
          setApiStatus(data.apiStatus);
        }

        const {
          replyText,
          displaySubtitle,
          emotion,
          tsukkomiScore: score,
          audioBase64,
          fallbackToBrowserTTS,
          quotaExceeded,
          isOfflineFallback: isOffline,
          ttsError,
        } = data;

        if (quotaExceeded) {
          setIsQuotaExceeded(true);
        }
        if (fallbackToBrowserTTS) {
          setIsUsingBrowserAudio(true);
        }
        if (isOffline) {
          setIsOfflineEngine(true);
        }

        setCurrentSubtitle(displaySubtitle || replyText);
        setCurrentEmotion(emotion || 'happy');
        setTsukkomiScore(score || 1);

        let finalAudioBase64 = audioBase64;
        let isUsingFallbackSpeech = fallbackToBrowserTTS;
        let activeEngine: 'Gemini' | 'Aivis' | 'Browser' = 'Gemini';

        if (isLocalEnvironment) {
          // 【ローカル実行環境】: AivisSpeech (さつき: 1935723904) を最優先で試行
          console.log(
            '🏠 [ローカル実行環境検知] AivisSpeech (さつき: 1935723904) を最優先エンジンとして合成を試行します。'
          );

          try {
            const aivisRes = await synthesizeAivisAudio(replyText, 1935723904);
            if (aivisRes.success && aivisRes.audioBase64) {
              finalAudioBase64 = aivisRes.audioBase64;
              isUsingFallbackSpeech = false;
              setIsUsingBrowserAudio(false);
              activeEngine = 'Aivis';
              console.log(
                '✅ [音声エンジン: AivisSpeech] AivisSpeech 合成に成功しました！「さつき」モデルの音声で再生します。'
              );
            } else {
              // AivisSpeech失敗時：勝手にロボット声へ切り替えず、原因を明示
              finalAudioBase64 = null;
              isUsingFallbackSpeech = false;
              activeEngine = 'Aivis';
              const errorReason = aivisRes.error || 'AivisSpeech Engine (127.0.0.1:10101) が停止しているか接続できません。';
              console.warn(`⚠️ [AivisSpeech 停止/未接続] ${errorReason}`);
              setCurrentSubtitle(`${displaySubtitle || replyText}（⚠️ AivisSpeech未接続: Engineを起動してください）`);
            }
          } catch (aivisErr: any) {
            finalAudioBase64 = null;
            isUsingFallbackSpeech = false;
            activeEngine = 'Aivis';
            console.warn(`⚠️ [AivisSpeech 例外] ${aivisErr?.message || aivisErr}`);
            setCurrentSubtitle(`${displaySubtitle || replyText}（⚠️ AivisSpeech未接続: Engineを起動してください）`);
          }
        } else {
          // 【クラウドプレビュー環境 (または判定不能時)】: 従来のGemini TTS優先ロジックを厳密に維持
          if (finalAudioBase64) {
            activeEngine = 'Gemini';
            console.log(
              '🔊 [音声エンジン: Gemini] Gemini TTS 音声の取得に成功しました。Gemini 高品質音声で再生します。'
            );
          } else {
            const switchReason = quotaExceeded
              ? 'Gemini TTS 無料枠上限 (429 RESOURCE_EXHAUSTED / クールダウン中)'
              : ttsError
              ? `Gemini TTS 生成エラー (${ttsError})`
              : 'Gemini TTS 音声データ未返却 (null/空)';

            console.log(
              `🔄 [音声エンジン切り替え 1/2] 理由:【${switchReason}】\n` +
              '➡️ ローカル音声合成エンジン AivisSpeech (さつき: 1935723904) への切り替えを試行します。'
            );

            try {
              const aivisRes = await synthesizeAivisAudio(replyText, 1935723904);
              if (aivisRes.success && aivisRes.audioBase64) {
                finalAudioBase64 = aivisRes.audioBase64;
                isUsingFallbackSpeech = false;
                setIsUsingBrowserAudio(false);
                activeEngine = 'Aivis';
                console.log(
                  '✅ [音声エンジン: AivisSpeech] AivisSpeech 合成に成功しました！さつきモデルの音声で再生します。'
                );
              } else {
                activeEngine = 'Browser';
                isUsingFallbackSpeech = true;
                console.warn(
                  `🔄 [音声エンジン切り替え 2/2] 理由:【AivisSpeech 合成失敗: ${aivisRes.error || '音声データ未生成'}】\n` +
                  '➡️ 最終フォールバックとしてブラウザ内蔵音声合成 (Web Speech API: Browser) へ切り替えます。'
                );
              }
            } catch (aivisErr: any) {
              activeEngine = 'Browser';
              isUsingFallbackSpeech = true;
              console.warn(
                `🔄 [音声エンジン切り替え 2/2] 理由:【AivisSpeech 例外発生: ${aivisErr?.message || aivisErr}】\n` +
                '➡️ 最終フォールバックとしてブラウザ内蔵音声合成 (Web Speech API: Browser) へ切り替えます。'
              );
            }
          }
        }

        const tetenaMsg: ChatMessage = {
          id: 'msg-' + (Date.now() + 1),
          sender: 'tetena',
          text: replyText,
          subtitleText: displaySubtitle,
          emotion: emotion as EmotionType,
          audioBase64: finalAudioBase64,
          timestamp: Date.now(),
          tsukkomiScore: score,
        };
        setChatHistory((prev) => [...prev, tetenaMsg]);

        // Sync with OBS window safely if channel is available and open
        if (channelRef.current !== null && isChannelOpenRef.current) {
          safePostMessage({
            type: 'NEW_REPLY',
            payload: {
              replyText: displaySubtitle || replyText,
              streamerText: messageText,
              emotion,
              tsukkomiScore: score,
              audioBase64: finalAudioBase64,
              fallbackToBrowserTTS: isUsingFallbackSpeech,
              engine: activeEngine,
            },
          });
        }

        // Play audio in the current window
        if (!isObsUrlMode) {
          console.log(
            `▶️ [音声再生実行] 確定エンジン:【${activeEngine}】 (テキスト: "${replyText.slice(0, 24)}${replyText.length > 24 ? '...' : ''}")`
          );
          if (finalAudioBase64) {
            await audioPlayer.playWavBase64(finalAudioBase64);
          } else if (isUsingFallbackSpeech) {
            await audioPlayer.speakBrowserFallback(replyText);
          }
        }
      } catch (err: any) {
        console.error('Talk API error:', err);
        const errorMsg = '⚠️ [AI通信エラー] 回答の取得に失敗しました: ' + (err?.message || 'ネットワークエラー');
        setCurrentSubtitle(errorMsg);
        setCurrentEmotion('worry');
        setIsUsingBrowserAudio(false);
        setApiStatus({
          activeEngine: 'LocalFallback',
          modelUsed: 'local-companion',
          errorType: 'API_ERROR',
          errorMessage: err?.message || 'ネットワーク通信エラー',
          retryInSeconds: 5,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      isLoading,
      chatHistory,
      gameContext,
      voiceName,
      memories,
      isObsUrlMode,
      safePostMessage,
    ]
  );

  // Toggle Microphone recognition
  const handleToggleMic = useCallback(() => {
    if (isListening) {
      speechRecognizer.stop();
      setIsListening(false);
      setInterimTranscript('');
    } else {
      getOpenChannel();
      speechRecognizer.start(
        {
          onInterim: (text) => {
            setInterimTranscript(text);
            if (text) {
              setStreamerSubtitle(text);
              if (channelRef.current !== null && isChannelOpenRef.current) {
                safePostMessage({
                  type: 'STREAMER_TALKING',
                  payload: { text },
                });
              }
            }
          },
          onFinal: (finalText) => {
            handleSendMessage(finalText);
          },
          onError: (errMsg) => {
            console.warn('Speech Recog Error:', errMsg);
            setIsListening(false);
          },
          onListeningStateChange: (state) => setIsListening(state),
        },
        true // Continuous mode for hands-free live gameplay
      );
    }
  }, [isListening, handleSendMessage, getOpenChannel, safePostMessage]);

  // Replay past audio
  const handleReplayAudio = async (msg: ChatMessage) => {
    if (msg.audioBase64) {
      setCurrentSubtitle(msg.subtitleText || msg.text);
      setCurrentEmotion(msg.emotion || 'happy');
      await audioPlayer.playWavBase64(msg.audioBase64);
    } else {
      setCurrentSubtitle(msg.subtitleText || msg.text);
      await audioPlayer.speakBrowserFallback(msg.text);
    }
  };

  // Avatar Poke Reaction
  const handlePokeAvatar = () => {
    const pokeReplies = [
      { text: 'ちょ、ちょっとクマ様！集中集中！画面から目を離しちゃダメ！', emotion: 'tsukkomi' as EmotionType },
      { text: 'えへへ、くすぐったいよ〜！そんなにいじるとゲームオーバーになっちゃうよ？', emotion: 'laugh' as EmotionType },
      { text: 'なに〜？てってなはいつでもクマ様の隣でしっかり見てるよ！', emotion: 'happy' as EmotionType },
      { text: 'ふふん、さては私の応援パワーが足りなくなってきたんだね！任せなさい！', emotion: 'smug' as EmotionType },
      { text: 'わっ！急につついてきてびっくりしたー！敵かと思ったじゃん！', emotion: 'surprise' as EmotionType },
      { text: 'もう〜、クマ様ったらお茶目なんだから！ほら、次の敵が迫ってきてるよ！', emotion: 'tsukkomi' as EmotionType },
      { text: 'ツンツン禁止ー！…嘘、ちょっと嬉しいかも。さあ、配信盛り上げていこ！', emotion: 'happy' as EmotionType },
    ];
    const picked = pokeReplies[Math.floor(Math.random() * pokeReplies.length)];
    setCurrentSubtitle(picked.text);
    setCurrentEmotion(picked.emotion);
    audioPlayer.speakBrowserFallback(picked.text).catch(() => {});
  };

  const handleOpenObsWindow = () => {
    window.open('/?mode=obs', 'TetenaObsOverlay', 'width=560,height=820,menubar=no,toolbar=no');
  };

  const updateObsSettings = (newSettings: Partial<ObsSettings>) => {
    setObsSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (channelRef.current !== null && isChannelOpenRef.current) {
        safePostMessage({
          type: 'SETTINGS_UPDATE',
          payload: updated,
        });
      }
      return updated;
    });
  };

  // If in dedicated OBS URL mode (?mode=obs), render full-screen OBS view
  if (isObsUrlMode || activeView === 'obs') {
    return (
      <div className="relative w-screen h-screen overflow-hidden">
        {/* Toggle back button (hover discreetly in top right for testing) */}
        {!isObsUrlMode && (
          <button
            onClick={() => setActiveView('dashboard')}
            className="absolute top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700 shadow-xl backdrop-blur-md transition-all"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            ダッシュボードに戻る
          </button>
        )}

        <ObsOverlayView
          currentSubtitle={currentSubtitle}
          streamerSubtitle={streamerSubtitle}
          currentEmotion={currentEmotion}
          isSpeaking={isSpeaking}
          volumeLevel={volumeLevel}
          tsukkomiScore={tsukkomiScore}
          obsSettings={obsSettings}
          onPokeAvatar={handlePokeAvatar}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 flex flex-col font-sans select-none">
      {/* Top Header Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-xl px-5 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Status Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-pink-500/20 text-xl">
              🌸
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base md:text-lg tracking-wide bg-gradient-to-r from-pink-300 via-rose-200 to-indigo-200 bg-clip-text text-transparent">
                  てってなちゃん
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-pink-500/20 border border-pink-400/40 text-pink-300 font-bold text-[10px] tracking-wider uppercase">
                  AI Stream Buddy
                </span>
                {isUsingBrowserAudio ? (
                  <span
                    className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 font-bold text-[10px]"
                    title="Gemini TTS利用上限のため、高精度ブラウザ音声で自動継続中"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    ブラウザ音声 (自動継続)
                  </span>
                ) : (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-bold text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Gemini TTS (Kore)
                  </span>
                )}
                {isOfflineEngine && (
                  <span
                    className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 font-bold text-[10px]"
                    title="Gemini API利用制限中もローカル実況知性エンジンが配信を継続サポート"
                  >
                    ⚡ 実況知性エンジン稼働中
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs hidden sm:block">
                ゲーム実況配信をリアルタイムに盛り上げる相棒AI
              </p>
            </div>
          </div>

          {/* Action Header Buttons */}
          <div className="flex items-center gap-2.5">
            {/* OBS Preview View Switch */}
            <button
              onClick={() => setActiveView('obs')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs font-bold border border-slate-700 transition-all shadow-sm"
              title="OBS全画面オーバーレイのプレビューに切り替え"
            >
              <Maximize2 className="w-3.5 h-3.5 text-pink-400" />
              <span className="hidden md:inline">全画面プレビュー</span>
            </button>

            {/* Separate OBS Window Opener */}
            <button
              onClick={handleOpenObsWindow}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
            >
              <Tv className="w-3.5 h-3.5" />
              <span>OBS用ウィンドウ</span>
              <ExternalLink className="w-3 h-3 opacity-70" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 flex flex-col gap-4">
        {/* Temporary AivisSpeech Network Verification Banner */}
        <AivisSpeechChecker />

        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Live Stage & Avatar Display (5 cols) */}
          <section className="lg:col-span-5 flex flex-col items-center gap-5 bg-slate-900/60 border border-slate-800/90 rounded-3xl p-6 shadow-2xl backdrop-blur-md relative overflow-hidden">
          {/* Ambient Studio Lighting Backdrop */}
          <div className="absolute top-1/4 -left-12 w-64 h-64 bg-pink-500/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 -right-12 w-64 h-64 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Current Game Tag Banner */}
          <div className="w-full flex items-center justify-between bg-slate-950/70 border border-slate-800 rounded-2xl px-4 py-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-bold truncate">
              <Gamepad2 className="w-4 h-4 text-pink-400 shrink-0" />
              <span className="truncate">
                {gameContext.gameTitle || 'ゲーム未設定'}
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold text-[11px] shrink-0">
              {gameContext.currentSituation || '実況中'}
            </span>
          </div>

          {/* Vector Mascot Character Stage */}
          <div className="relative py-4 flex justify-center items-center">
            <TetenaAvatar
              emotion={currentEmotion}
              isSpeaking={isSpeaking}
              volumeLevel={volumeLevel}
              scale={obsSettings.avatarScale}
              onPoke={handlePokeAvatar}
            />
          </div>

          {/* Subtitle Dialogue Bar */}
          <div className="w-full flex justify-center">
            <SubtitleBar
              streamerText={obsSettings.showStreamerSpeech ? streamerSubtitle : ''}
              tetenaText={currentSubtitle}
              tetenaEmotion={currentEmotion}
              isSpeaking={isSpeaking}
              tsukkomiScore={tsukkomiScore}
              fontSize={obsSettings.fontSize}
            />
          </div>

          {/* Helpful stream hint footer */}
          <div className="w-full flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-800/60 pt-3">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-pink-400" />
              てってなちゃんをクリックでちょっかいを出せます
            </span>
            <span className="text-slate-400">
              OBS連携：<strong>?mode=obs</strong>
            </span>
          </div>
        </section>

        {/* Right Column: Streamer Control Room (7 cols) */}
        <section className="lg:col-span-7 h-full">
          <ControlPanel
            isListening={isListening}
            onToggleMic={handleToggleMic}
            interimTranscript={interimTranscript}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            gameContext={gameContext}
            onUpdateGameContext={(ctx) => setGameContext((prev) => ({ ...prev, ...ctx }))}
            onResetGameContext={() => setGameContext(DEFAULT_GAME_CONTEXT)}
            obsSettings={obsSettings}
            onUpdateObsSettings={updateObsSettings}
            chatHistory={chatHistory}
            onClearHistory={() => setChatHistory([])}
            onReplayAudio={handleReplayAudio}
            isSpeaking={isSpeaking}
            onStopSpeech={() => audioPlayer.stop()}
            volume={volume}
            onVolumeChange={(vol) => {
              setVolume(vol);
              audioPlayer.setVolume(vol);
            }}
            onOpenObsWindow={handleOpenObsWindow}
            voiceName={voiceName}
            onVoiceNameChange={setVoiceName}
            isQuotaExceeded={isQuotaExceeded}
            isUsingBrowserAudio={isUsingBrowserAudio}
            memories={memories}
            onAddMemory={handleAddMemory}
            onEditMemory={handleEditMemory}
            onDeleteMemory={handleDeleteMemory}
            apiStatus={apiStatus}
          />
        </section>
        </div>
      </main>
    </div>
  );
}

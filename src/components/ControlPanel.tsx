import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Gamepad2,
  Tv,
  Sparkles,
  Send,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Settings2,
  RotateCcw,
} from 'lucide-react';
import { ChatMessage, GameContext, ObsSettings, ToneStyle, MemoryItem, ApiStatusInfo } from '../types';
import { testAivisSpeechConnection, getAivisBaseUrl } from '../utils/aivisSpeech';

interface ControlPanelProps {
  isListening: boolean;
  onToggleMic: () => void;
  interimTranscript: string;
  onSendMessage: (text: string) => void;
  isLoading: boolean;
  gameContext: GameContext;
  onUpdateGameContext: (ctx: Partial<GameContext>) => void;
  onResetGameContext?: () => void;
  obsSettings: ObsSettings;
  onUpdateObsSettings: (settings: Partial<ObsSettings>) => void;
  chatHistory: ChatMessage[];
  onClearHistory: () => void;
  onReplayAudio: (msg: ChatMessage) => void;
  isSpeaking: boolean;
  onStopSpeech: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onOpenObsWindow: () => void;
  voiceName: string;
  onVoiceNameChange: (v: string) => void;
  isQuotaExceeded?: boolean;
  isUsingBrowserAudio?: boolean;
  memories?: MemoryItem[];
  onAddMemory?: (content: string) => void;
  onEditMemory?: (id: string, newContent: string) => void;
  onDeleteMemory?: (id: string) => void;
  apiStatus?: ApiStatusInfo;
}

const quickReactions = [
  { label: 'ナイスプレイ！', prompt: 'いまのプレイ最高だったでしょ！ナイスって言って！', icon: '👏', color: 'from-amber-500/20 to-amber-600/30 border-amber-500/40 text-amber-200' },
  { label: 'やらかした…', prompt: 'ああーっ！完全にやらかした！ツッコミ入れて！', icon: '💥', color: 'from-rose-500/20 to-rose-600/30 border-rose-500/40 text-rose-200' },
  { label: 'ボス戦開始！', prompt: 'ボス戦が始まったよ！気合入れていこう！', icon: '⚔️', color: 'from-purple-500/20 to-purple-600/30 border-purple-500/40 text-purple-200' },
  { label: '大ピンチ！', prompt: 'HPミリ！敵に囲まれて絶体絶命のピンチだよ！助けて！', icon: '😱', color: 'from-red-500/20 to-red-600/30 border-red-500/40 text-red-200' },
  { label: '奇跡の勝利！', prompt: '勝ったぁぁぁ！奇跡の大逆転勝利だよ！', icon: '🏆', color: 'from-yellow-500/20 to-yellow-600/30 border-yellow-500/40 text-yellow-200' },
  { label: 'ガチャ引くよ！', prompt: '最高レア狙ってガチャ引くよ！祈ってて！', icon: '🎰', color: 'from-pink-500/20 to-pink-600/30 border-pink-500/40 text-pink-200' },
  { label: 'ホラーで絶叫', prompt: 'ぎゃあああああ！！何いまの！？心臓止まるかと思った！', icon: '👻', color: 'from-indigo-500/20 to-indigo-600/30 border-indigo-500/40 text-indigo-200' },
  { label: '雑談しよう', prompt: 'ちょっと休憩がてら雑談しようか！リスナーにも挨拶して！', icon: '☕', color: 'from-emerald-500/20 to-emerald-600/30 border-emerald-500/40 text-emerald-200' },
];

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isListening,
  onToggleMic,
  interimTranscript,
  onSendMessage,
  isLoading,
  gameContext,
  onUpdateGameContext,
  onResetGameContext,
  obsSettings,
  onUpdateObsSettings,
  chatHistory,
  onClearHistory,
  onReplayAudio,
  isSpeaking,
  onStopSpeech,
  volume,
  onVolumeChange,
  onOpenObsWindow,
  voiceName,
  onVoiceNameChange,
  isQuotaExceeded = false,
  isUsingBrowserAudio = false,
  memories = [],
  onAddMemory,
  onEditMemory,
  onDeleteMemory,
  apiStatus,
}) => {
  const [inputText, setInputText] = useState('');
  const [activeTab, setActiveTab] = useState<'stream' | 'settings' | 'history'>('stream');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [aivisTesting, setAivisTesting] = useState(false);
  const [aivisResult, setAivisResult] = useState<string | null>(null);
  const [newMemoryText, setNewMemoryText] = useState('');

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const copyObsUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', 'obs');
    navigator.clipboard.writeText(url.toString());
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden">
      {/* Top Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5 bg-slate-950/60">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('stream')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'stream'
                ? 'bg-pink-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            実況コントロール
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'settings'
                ? 'bg-pink-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            OBS / 設定
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'history'
                ? 'bg-pink-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            会話履歴 ({chatHistory.length})
          </button>
        </div>

        {/* Volume & Speech Stop */}
        <div className="flex items-center gap-2">
          {isSpeaking && (
            <button
              onClick={onStopSpeech}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/20 border border-rose-500/50 text-rose-300 hover:bg-rose-500/30 text-xs font-bold transition-all"
            >
              <VolumeX className="w-3.5 h-3.5" />
              声を止める
            </button>
          )}
          <div className="flex items-center gap-1.5 text-slate-400">
            <Volume2 className="w-4 h-4 text-slate-400" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-16 accent-pink-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              title="音量調整"
            />
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {activeTab === 'stream' && (
          <>
            {/* Live Microphone Status Banner */}
            <div className="bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 rounded-2xl p-4 shadow-inner">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                      isListening
                        ? 'bg-pink-600/30 text-pink-400 border border-pink-500 shadow-[0_0_20px_rgba(244,114,182,0.4)]'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {isListening ? (
                      <Mic key="mic-active-icon" className="w-6 h-6 animate-pulse" />
                    ) : (
                      <MicOff key="mic-inactive-icon" className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white text-sm">
                        マイク音声入力（実況連携）
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          isListening
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {isListening ? '常時聞き取り中 (VAD)' : 'マイク停止中'}
                      </span>
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5">
                      ゲームをプレイしながら話すだけで、てってなちゃんが自動で相づちやツッコミを返します。
                    </p>
                  </div>
                </div>

                <button
                  onClick={onToggleMic}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 ${
                    isListening
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                      : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white shadow-pink-900/40'
                  }`}
                >
                  {isListening ? (
                    <span key="mic-off-content" className="flex items-center gap-2 pointer-events-none">
                      <MicOff className="w-4 h-4" />
                      <span>マイク入力を停止</span>
                    </span>
                  ) : (
                    <span key="mic-on-content" className="flex items-center gap-2 pointer-events-none">
                      <Mic className="w-4 h-4" />
                      <span>マイク入力を開始</span>
                    </span>
                  )}
                </button>
              </div>

              {/* Interim Real-time Transcript Preview */}
              {interimTranscript && (
                <div className="mt-3 pt-3 border-t border-slate-800 flex items-center gap-2 text-cyan-300 text-xs font-medium">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span className="text-slate-400">聞き取り中:</span>
                  <span className="font-bold underline decoration-cyan-500/50">
                    {interimTranscript}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Game Reactions / Soundboard */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-extrabold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                  実況クイックアクション（ワンタップで即ツッコミ）
                </span>
                <span className="text-[11px] text-slate-500">
                  ゲームプレイ中でも瞬時に呼び出せます
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {quickReactions.map((item, idx) => (
                  <button
                    key={idx}
                    disabled={isLoading}
                    onClick={() => onSendMessage(item.prompt)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border bg-gradient-to-br transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 text-left ${item.color}`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-xs font-bold leading-tight truncate">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Current Game Context Bar */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Gamepad2 className="w-4 h-4 text-purple-400" />
                  配信コンテキスト（ゲーム情報）
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 hidden sm:inline">
                    会話の話題やツッコミに反映されます
                  </span>
                  {onResetGameContext && (
                    <button
                      type="button"
                      onClick={onResetGameContext}
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-900 border border-slate-700 hover:border-slate-600 transition-all"
                      title="おまかせ設定にリセット"
                    >
                      <RotateCcw className="w-3 h-3 text-pink-400" />
                      初期値にリセット
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 font-bold mb-1">
                    ゲームタイトル
                  </label>
                  <input
                    type="text"
                    value={gameContext.gameTitle}
                    onChange={(e) => onUpdateGameContext({ gameTitle: e.target.value })}
                    placeholder="例: マインクラフト、Apex、モンハン"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-bold mb-1">
                    現在のシーン / 状況
                  </label>
                  <input
                    type="text"
                    value={gameContext.currentSituation}
                    onChange={(e) => onUpdateGameContext({ currentSituation: e.target.value })}
                    placeholder="例: ボス戦、初見ダンジョン、ガチャ"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-pink-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 font-bold mb-1">
                    相棒の性格ノリ
                  </label>
                  <select
                    value={gameContext.toneStyle}
                    onChange={(e) => onUpdateGameContext({ toneStyle: e.target.value as ToneStyle })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="tsukkomi">ツッコミ＆ハイテンション (推奨)</option>
                    <option value="energetic">全力応援＆パッション</option>
                    <option value="healing">優しく見守る癒やし系</option>
                    <option value="sassy">ちょっとお茶目な毒舌相棒</option>
                    <option value="hardcore">ガチゲーマー相棒</option>
                  </select>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-5">
            {/* OBS Studio Integration Guide & URL */}
            <div className="bg-gradient-to-br from-indigo-950/40 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-300">
                  <Tv className="w-5 h-5" />
                  <h3 className="font-bold text-sm">OBS Studio ブラウザソース連携</h3>
                </div>
                <button
                  onClick={onOpenObsWindow}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  OBSオーバーレイを開く
                </button>
              </div>

              <p className="text-slate-300 text-xs leading-relaxed">
                OBSの「ソース追加」→「ブラウザ」で以下のURLを貼り付けると、てってなちゃんと字幕テロップがゲーム画面上に透過表示されます。
              </p>

              <div className="flex items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-xl p-2.5">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}/?mode=obs`}
                  className="bg-transparent flex-1 text-xs text-slate-300 font-mono focus:outline-none select-all"
                />
                <button
                  onClick={copyObsUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs transition-all shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? 'コピー完了！' : 'URLをコピー'}
                </button>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="font-bold text-slate-300">推奨OBSソース設定：</div>
                <div>・幅: <strong>550</strong> / 高さ: <strong>800</strong></div>
                <div>・カスタムCSS: デフォルトのままでOK（背景透過が有効になります）</div>
                <div>・表示されていないときにソースをシャットダウン: <strong>オフ</strong></div>
              </div>
            </div>

            {/* Overlay Visual Customization */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-4">
              <h4 className="font-bold text-xs text-slate-300 uppercase tracking-wider">
                オーバーレイ画面のカスタマイズ
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">
                    背景カラー（クロマキー / 透過）
                  </label>
                  <select
                    value={obsSettings.backgroundMode}
                    onChange={(e) =>
                      onUpdateObsSettings({
                        backgroundMode: e.target.value as ObsSettings['backgroundMode'],
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="transparent">完全透過（OBSブラウザ標準）</option>
                    <option value="green">グリーンバック (#00FF00)</option>
                    <option value="magenta">マゼンタ (#FF00FF)</option>
                    <option value="dark">ダークプレビュー (#0F172A)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">
                    字幕フォントサイズ
                  </label>
                  <select
                    value={obsSettings.fontSize}
                    onChange={(e) =>
                      onUpdateObsSettings({
                        fontSize: e.target.value as ObsSettings['fontSize'],
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="sm">小（標準サイズ）</option>
                    <option value="md">中（見やすい）</option>
                    <option value="lg">大（配信画面で目立つ・推奨）</option>
                    <option value="xl">特大（迫力重視）</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">
                    Gemini TTS 音声モデル
                  </label>
                  <select
                    value={voiceName}
                    onChange={(e) => onVoiceNameChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="Kore">Kore（若々しく明るい女性声・推奨）</option>
                    <option value="Zephyr">Zephyr（爽やかで親しみやすい声）</option>
                    <option value="Puck">Puck（元気で遊び心のある声）</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">
                    配信者の声の字幕表示
                  </label>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={obsSettings.showStreamerSpeech}
                      onChange={(e) =>
                        onUpdateObsSettings({ showStreamerSpeech: e.target.checked })
                      }
                      className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-pink-600 accent-pink-500"
                    />
                    <span className="text-xs text-slate-300">
                      配信者のマイク文字起こしも画面に出す
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Audio Engine & Quota Status Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>音声＆AIエンジンの稼働状態</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      isUsingBrowserAudio
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    }`}
                  >
                    {isUsingBrowserAudio ? 'ブラウザ高精度音声 (稼働中)' : 'Gemini TTS (稼働中)'}
                  </span>
                  {apiStatus && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-400/30">
                      {apiStatus.activeEngine}: {apiStatus.modelUsed}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                Google Gemini APIの無料利用枠（TTSは1日10回、Flashは1日20回）を超過した場合でも、本アプリは自動的に『ブラウザ音声合成』および『ローカル実況知性エンジン』へシームレスに切り替わります。配信中に返答や音声が途切れることはありません。
              </p>
            </div>

            {/* Long-term Memories (クマ様 Identity & Settings) Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>相棒の長期記憶（クマ様の設定・思い出）</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  AI相棒が常に記憶する事項
                </span>
              </div>

              {memories && memories.length > 0 && (
                <div className="space-y-2">
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200"
                    >
                      <span className="flex-1 leading-relaxed">🐻 {m.content}</span>
                      {onDeleteMemory && (
                        <button
                          type="button"
                          onClick={() => onDeleteMemory(m.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                          title="記憶を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {onAddMemory && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    placeholder="新しい記憶を追加（例: 愛犬の名前はポチ、好きなゲームはRPG）"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (newMemoryText.trim()) {
                          onAddMemory(newMemoryText.trim());
                          setNewMemoryText('');
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newMemoryText.trim()) {
                        onAddMemory(newMemoryText.trim());
                        setNewMemoryText('');
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs transition-all shrink-0"
                  >
                    追加
                  </button>
                </div>
              )}
            </div>

            {/* AivisSpeech Connection Test Card */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                  <Volume2 className="w-4 h-4 text-pink-400" />
                  <span>AivisSpeech Engine 接続検証</span>
                </div>
                <button
                  type="button"
                  disabled={aivisTesting}
                  onClick={async () => {
                    setAivisTesting(true);
                    setAivisResult(null);
                    const res = await testAivisSpeechConnection(getAivisBaseUrl());
                    if (res.success) {
                      setAivisResult(`通信成功！ 話者数: ${res.speakersCount}名 ${res.satsuki ? '(さつき確認済: ID ' + (res.satsuki.styles.find(s => s.id === 1935723904)?.id || '検出') + ')' : ''}`);
                    } else {
                      setAivisResult(`接続失敗: ${res.error || '通信エラー'}`);
                    }
                    setAivisTesting(false);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
                >
                  {aivisTesting ? '接続確認中...' : 'GET /speakers テスト実行'}
                </button>
              </div>

              <p className="text-slate-400 text-xs leading-relaxed">
                Windows 上で起動中の AivisSpeech Engine（<code>http://127.0.0.1:10101/speakers</code>）へブラウザから疎通確認を行います。結果は画面およびブラウザの開発者ツール（F12コンソール）に詳細出力されます。
              </p>

              {aivisResult && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold ${
                    aivisResult.startsWith('通信成功')
                      ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {aivisResult}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-400">
                本セッションの会話ログ
              </span>
              {chatHistory.length > 0 && (
                <button
                  onClick={onClearHistory}
                  className="flex items-center gap-1 text-rose-400 hover:text-rose-300 text-xs font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  ログを消去
                </button>
              )}
            </div>

            {chatHistory.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs">
                まだ会話ログはありません。マイクで話しかけるか、クイックアクションを押してみてください！
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {chatHistory.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border text-xs leading-relaxed ${
                      item.sender === 'streamer'
                        ? 'bg-slate-950/70 border-cyan-500/30 text-cyan-200 ml-6'
                        : 'bg-slate-950/90 border-pink-500/40 text-pink-100 mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1 text-[11px] font-bold">
                      <span className={item.sender === 'streamer' ? 'text-cyan-400' : 'text-pink-400'}>
                        {item.sender === 'streamer' ? '🎙️ あなた (配信者)' : '🌸 てってなちゃん'}
                      </span>
                      {item.audioBase64 && (
                        <button
                          onClick={() => onReplayAudio(item)}
                          className="flex items-center gap-1 text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-all"
                          title="音声を再生"
                        >
                          <Volume2 className="w-3 h-3 text-pink-400" />
                          再生
                        </button>
                      )}
                    </div>
                    <p className="font-medium">{item.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Manual Text Input Bar */}
      <div className="p-4 bg-slate-950/90 border-t border-slate-800">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isLoading}
            placeholder={
              isLoading
                ? 'てってなちゃんが考え中…'
                : 'キーボードで発言する（例: ボス倒したよ！、今ので合ってる？）'
            }
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg disabled:opacity-40 transition-all"
          >
            {isLoading ? (
              <RotateCcw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            送信
          </button>
        </form>
      </div>
    </div>
  );
};

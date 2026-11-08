import React from 'react';
import { EmotionType } from '../types';

interface SubtitleBarProps {
  streamerText?: string;
  tetenaText?: string;
  tetenaEmotion?: EmotionType;
  isSpeaking: boolean;
  tsukkomiScore?: number;
  position?: 'bubble' | 'bottom' | 'side';
  fontSize?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const emotionLabels: Record<EmotionType, { label: string; color: string; bg: string }> = {
  happy: { label: 'ごきげん♪', color: 'text-amber-300', bg: 'bg-amber-500/20 border-amber-400/40' },
  excited: { label: '大興奮！✨', color: 'text-pink-300', bg: 'bg-pink-500/20 border-pink-400/40' },
  tsukkomi: { label: 'ツッコミ！⚡', color: 'text-yellow-300', bg: 'bg-yellow-500/30 border-yellow-400/60' },
  laugh: { label: '大爆笑ｗ😆', color: 'text-orange-300', bg: 'bg-orange-500/20 border-orange-400/40' },
  surprise: { label: 'ええっ！？💥', color: 'text-purple-300', bg: 'bg-purple-500/20 border-purple-400/40' },
  worry: { label: '心配…💦', color: 'text-blue-300', bg: 'bg-blue-500/20 border-blue-400/40' },
  smug: { label: 'ドヤァ✨', color: 'text-emerald-300', bg: 'bg-emerald-500/20 border-emerald-400/40' },
  neutral: { label: '実況相棒', color: 'text-cyan-300', bg: 'bg-cyan-500/20 border-cyan-400/40' },
};

export const SubtitleBar: React.FC<SubtitleBarProps> = ({
  streamerText,
  tetenaText,
  tetenaEmotion = 'neutral',
  isSpeaking,
  tsukkomiScore = 1,
  position = 'bubble',
  fontSize = 'lg',
  className = '',
}) => {
  const emotionInfo = emotionLabels[tetenaEmotion] || emotionLabels.neutral;

  const fontSizes = {
    sm: 'text-sm md:text-base',
    md: 'text-base md:text-lg',
    lg: 'text-lg md:text-2xl',
    xl: 'text-xl md:text-3xl',
  };

  return (
    <div className={`flex flex-col gap-2.5 max-w-2xl w-full select-none ${className}`}>
      {/* Streamer Speech Subtitle (Live Mic Transcription) */}
      {streamerText && (
        <div className="flex items-start gap-2 bg-slate-950/80 backdrop-blur-md border border-cyan-500/50 rounded-2xl px-4 py-2.5 shadow-xl animate-fade-in transition-all">
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-900/40 border border-cyan-400/50 text-cyan-300 text-xs font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            配信者
          </div>
          <p className="text-cyan-100 font-medium text-sm md:text-base leading-relaxed tracking-wide drop-shadow-md">
            {streamerText}
          </p>
        </div>
      )}

      {/* Tetena-chan Reply & Subtitle */}
      {tetenaText && (
        <div
          className={`relative overflow-hidden bg-slate-950/90 backdrop-blur-md rounded-2xl p-4 md:p-5 border-2 shadow-2xl transition-all duration-300 ${
            tetenaEmotion === 'tsukkomi'
              ? 'border-yellow-400/80 shadow-[0_0_25px_rgba(250,204,21,0.3)]'
              : isSpeaking
              ? 'border-pink-400/80 shadow-[0_0_25px_rgba(244,114,182,0.35)]'
              : 'border-pink-500/40'
          }`}
        >
          {/* Top header with name badge, emotion tag, and speaking audio ripple */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white font-extrabold text-xs shadow-md">
                <span>🌸</span> てってなちゃん
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full border text-xs font-bold ${emotionInfo.bg} ${emotionInfo.color}`}
              >
                {emotionInfo.label}
              </span>
              {tsukkomiScore > 2 && (
                <span className="px-2 py-0.5 rounded-full bg-yellow-400 text-slate-950 text-xs font-black animate-bounce">
                  ツッコミ Lv.{tsukkomiScore}
                </span>
              )}
            </div>

            {/* Speaking equalizer bars */}
            {isSpeaking && (
              <div className="flex items-end gap-1 h-4 px-2">
                <span className="w-1 bg-pink-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
                <span className="w-1 bg-purple-400 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-4" />
                <span className="w-1 bg-cyan-400 rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-2" />
                <span className="w-1 bg-pink-400 rounded-full animate-[pulse_0.7s_ease-in-out_infinite] h-3.5" />
              </div>
            )}
          </div>

          {/* Subtitle Dialogue Text */}
          <div className="relative">
            <p
              className={`font-black tracking-wide leading-snug text-white ${fontSizes[fontSize]} drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]`}
              style={{
                textShadow:
                  '0 2px 4px rgba(0,0,0,0.9), 0 0 2px #000, 0 0 1px #000, 0 0 4px rgba(244,114,182,0.4)',
              }}
            >
              {tetenaText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { TetenaAvatar } from './TetenaAvatar';
import { SubtitleBar } from './SubtitleBar';
import { EmotionType, ObsSettings } from '../types';
import { audioPlayer } from '../utils/audioPlayer';

interface ObsOverlayViewProps {
  currentSubtitle: string;
  streamerSubtitle: string;
  currentEmotion: EmotionType;
  isSpeaking: boolean;
  volumeLevel: number;
  tsukkomiScore: number;
  obsSettings: ObsSettings;
  onPokeAvatar?: () => void;
}

export const ObsOverlayView: React.FC<ObsOverlayViewProps> = ({
  currentSubtitle,
  streamerSubtitle,
  currentEmotion,
  isSpeaking,
  volumeLevel,
  tsukkomiScore,
  obsSettings,
  onPokeAvatar,
}) => {
  // Determine background style according to chroma-key setting
  const getBgStyle = () => {
    switch (obsSettings.backgroundMode) {
      case 'green':
        return 'bg-[#00FF00]';
      case 'magenta':
        return 'bg-[#FF00FF]';
      case 'dark':
        return 'bg-slate-950';
      case 'transparent':
      default:
        return 'bg-transparent';
    }
  };

  return (
    <div
      className={`fixed inset-0 w-screen h-screen flex flex-col justify-end items-center p-6 sm:p-10 select-none overflow-hidden ${getBgStyle()}`}
    >
      {/* Subtitles Area (Placed neatly above avatar or floating) */}
      <div className="w-full max-w-xl flex justify-center mb-4 transition-all duration-300">
        <SubtitleBar
          streamerText={obsSettings.showStreamerSpeech ? streamerSubtitle : ''}
          tetenaText={currentSubtitle}
          tetenaEmotion={currentEmotion}
          isSpeaking={isSpeaking}
          tsukkomiScore={tsukkomiScore}
          fontSize={obsSettings.fontSize}
        />
      </div>

      {/* Avatar Area */}
      <div className="relative flex justify-center items-end">
        <TetenaAvatar
          emotion={currentEmotion}
          isSpeaking={isSpeaking}
          volumeLevel={volumeLevel}
          scale={obsSettings.avatarScale || 1.1}
          onPoke={onPokeAvatar}
        />
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { EmotionType } from '../types';

interface TetenaAvatarProps {
  emotion?: EmotionType;
  isSpeaking: boolean;
  volumeLevel: number; // 0.0 to 1.0 from AudioAnalyser
  scale?: number;
  onPoke?: () => void;
  className?: string;
}

export const TetenaAvatar: React.FC<TetenaAvatarProps> = ({
  emotion = 'neutral',
  isSpeaking,
  volumeLevel,
  scale = 1,
  onPoke,
  className = '',
}) => {
  const [isBlinking, setIsBlinking] = useState(false);

  // Natural blinking effect
  useEffect(() => {
    let timeout: any;
    const triggerBlink = () => {
      setIsBlinking(true);
      timeout = setTimeout(() => {
        setIsBlinking(false);
        // Schedule next blink in 2.5 to 5.5 seconds
        const nextBlink = 2500 + Math.random() * 3000;
        timeout = setTimeout(triggerBlink, nextBlink);
      }, 150);
    };

    const initial = setTimeout(triggerBlink, 2000);
    return () => {
      clearTimeout(initial);
      clearTimeout(timeout);
    };
  }, []);

  // Compute mouth open height based on audio level or speaking state
  const mouthOpen = isSpeaking ? Math.max(0.2, Math.min(1.0, volumeLevel * 2.2)) : 0;

  // Head bobbing / motion classes
  const getMotionClass = () => {
    if (emotion === 'excited') return 'animate-bounce';
    if (emotion === 'laugh') return 'animate-pulse';
    if (isSpeaking) return 'motion-safe:animate-[pulse_1.5s_ease-in-out_infinite]';
    return '';
  };

  return (
    <div
      onClick={onPoke}
      title="てってなちゃん（クリックするとリアクションするよ！）"
      className={`relative inline-block select-none cursor-pointer group transition-transform duration-300 ${getMotionClass()} ${className}`}
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'bottom center',
      }}
    >
      {/* Audio Reactive Glow Aura */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-all duration-200 pointer-events-none ${
          isSpeaking
            ? 'bg-gradient-to-tr from-pink-500/40 via-purple-500/30 to-amber-300/30 scale-110'
            : 'bg-pink-400/10 group-hover:bg-pink-400/20'
        }`}
        style={{
          transform: `scale(${1 + (isSpeaking ? volumeLevel * 0.4 : 0)})`,
        }}
      />

      {/* Main SVG Character Render */}
      <svg
        viewBox="0 0 320 360"
        className="w-64 h-72 md:w-72 md:h-80 drop-shadow-2xl overflow-visible"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF7EB3" />
            <stop offset="50%" stopColor="#FF6584" />
            <stop offset="100%" stopColor="#FF416C" />
          </linearGradient>
          <linearGradient id="skinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFF7F3" />
            <stop offset="100%" stopColor="#FFE8DF" />
          </linearGradient>
          <linearGradient id="headphoneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4A00E0" />
            <stop offset="100%" stopColor="#8E2DE2" />
          </linearGradient>
          <linearGradient id="eyeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6C5CE7" />
            <stop offset="50%" stopColor="#A29BFE" />
            <stop offset="100%" stopColor="#FD79A8" />
          </linearGradient>
          <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Back Hair (Twin Tails / Flowing) */}
        <path
          d="M 60 170 Q 20 220 30 300 Q 55 310 80 250 Z"
          fill="url(#hairGrad)"
          className="transition-transform duration-500 origin-[80px_170px]"
          style={{
            transform: isSpeaking ? `rotate(${Math.sin(Date.now() / 200) * 4}deg)` : 'none',
          }}
        />
        <path
          d="M 260 170 Q 300 220 290 300 Q 265 310 240 250 Z"
          fill="url(#hairGrad)"
          className="transition-transform duration-500 origin-[240px_170px]"
          style={{
            transform: isSpeaking ? `rotate(${-Math.sin(Date.now() / 200) * 4}deg)` : 'none',
          }}
        />

        {/* Headphone Arch */}
        <path
          d="M 70 140 A 100 100 0 0 1 250 140"
          stroke="url(#headphoneGrad)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />

        {/* Cat Ears / Headset Antenna */}
        <path d="M 90 95 L 75 40 L 125 70 Z" fill="#FF416C" />
        <path d="M 88 88 L 78 48 L 118 72 Z" fill="#FFE8DF" />
        <path d="M 230 95 L 245 40 L 195 70 Z" fill="#FF416C" />
        <path d="M 232 88 L 242 48 L 202 72 Z" fill="#FFE8DF" />

        {/* Gamer Headphone Ear Cups with RGB Rings */}
        <circle cx="65" cy="170" r="24" fill="#2D3436" />
        <circle
          cx="65"
          cy="170"
          r="19"
          stroke={isSpeaking ? '#00FFCC' : '#FF6584'}
          strokeWidth="4"
          fill="#1E272E"
          filter="url(#softGlow)"
        />
        <circle cx="255" cy="170" r="24" fill="#2D3436" />
        <circle
          cx="255"
          cy="170"
          r="19"
          stroke={isSpeaking ? '#00FFCC' : '#FF6584'}
          strokeWidth="4"
          fill="#1E272E"
          filter="url(#softGlow)"
        />

        {/* Head Base / Face */}
        <path
          d="M 95 140 Q 75 220 160 255 Q 245 220 225 140 Q 160 115 95 140 Z"
          fill="url(#skinGrad)"
        />

        {/* Cheeks Blushing */}
        <ellipse
          cx="110"
          cy="205"
          rx={emotion === 'happy' || emotion === 'excited' ? '18' : '14'}
          ry="8"
          fill="#FF7675"
          opacity={emotion === 'worry' ? '0.3' : emotion === 'smug' ? '0.6' : '0.55'}
        />
        <ellipse
          cx="210"
          cy="205"
          rx={emotion === 'happy' || emotion === 'excited' ? '18' : '14'}
          ry="8"
          fill="#FF7675"
          opacity={emotion === 'worry' ? '0.3' : emotion === 'smug' ? '0.6' : '0.55'}
        />

        {/* Eyes Rendering based on emotion and blinking */}
        {isBlinking ? (
          // Blinking eyes: cute curved lines
          <>
            <path
              d="M 105 178 Q 125 188 145 178"
              stroke="#2D3436"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 175 178 Q 195 188 215 178"
              stroke="#2D3436"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : emotion === 'laugh' || emotion === 'happy' ? (
          // Happy smiling eyes (arc shaped ^ ^)
          <>
            <path
              d="M 105 182 Q 125 162 145 182"
              stroke="#2D3436"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 175 182 Q 195 162 215 182"
              stroke="#2D3436"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : emotion === 'tsukkomi' ? (
          // Tsukkomi / Sarcastic skeptical gaze
          <>
            {/* Left eye half-closed */}
            <path
              d="M 105 170 Q 125 165 145 172"
              stroke="#2D3436"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="125" cy="177" r="7" fill="#6C5CE7" />
            {/* Right eye raised eyebrow */}
            <path
              d="M 175 172 Q 195 163 215 168"
              stroke="#2D3436"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
            <circle cx="195" cy="177" r="7" fill="#6C5CE7" />
          </>
        ) : emotion === 'smug' ? (
          // Smug wink
          <>
            {/* Left eye open */}
            <ellipse cx="125" cy="175" rx="14" ry="17" fill="url(#eyeGrad)" />
            <circle cx="121" cy="171" r="5" fill="#FFFFFF" />
            <circle cx="128" cy="180" r="2.5" fill="#FFFFFF" />
            {/* Right eye winking */}
            <path
              d="M 178 178 Q 195 190 212 176"
              stroke="#2D3436"
              strokeWidth="5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : emotion === 'surprise' ? (
          // Surprise wide eyes
          <>
            <circle cx="125" cy="175" r="18" fill="url(#eyeGrad)" />
            <circle cx="125" cy="175" r="8" fill="#1E272E" />
            <circle cx="120" cy="168" r="6" fill="#FFFFFF" />
            <circle cx="195" cy="175" r="18" fill="url(#eyeGrad)" />
            <circle cx="195" cy="175" r="8" fill="#1E272E" />
            <circle cx="190" cy="168" r="6" fill="#FFFFFF" />
          </>
        ) : (
          // Normal/Excited big anime eyes
          <>
            <ellipse cx="125" cy="175" rx="15" ry="19" fill="url(#eyeGrad)" />
            <circle cx="125" cy="178" r="9" fill="#1E272E" />
            <circle cx="120" cy="168" r="6" fill="#FFFFFF" />
            <circle cx="129" cy="182" r="3" fill="#FFFFFF" />
            {emotion === 'excited' && (
              <text x="119" y="180" fontSize="11" fill="#FFFA65" fontWeight="bold">
                ★
              </text>
            )}

            <ellipse cx="195" cy="175" rx="15" ry="19" fill="url(#eyeGrad)" />
            <circle cx="195" cy="178" r="9" fill="#1E272E" />
            <circle cx="190" cy="168" r="6" fill="#FFFFFF" />
            <circle cx="199" cy="182" r="3" fill="#FFFFFF" />
            {emotion === 'excited' && (
              <text x="189" y="180" fontSize="11" fill="#FFFA65" fontWeight="bold">
                ★
              </text>
            )}
          </>
        )}

        {/* Eyebrows */}
        {emotion === 'worry' ? (
          <>
            <path
              d="M 105 158 Q 125 150 142 158"
              stroke="#2D3436"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 178 158 Q 195 150 215 158"
              stroke="#2D3436"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : emotion === 'tsukkomi' ? (
          <>
            <path
              d="M 105 152 Q 125 156 142 160"
              stroke="#2D3436"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 178 160 Q 195 154 215 150"
              stroke="#2D3436"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : (
          <>
            <path
              d="M 108 152 Q 125 146 142 152"
              stroke="#2D3436"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 178 152 Q 195 146 212 152"
              stroke="#2D3436"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          </>
        )}

        {/* Nose */}
        <circle cx="160" cy="198" r="2" fill="#E17055" />

        {/* Reactive Mouth / Lip Sync */}
        {mouthOpen > 0.1 ? (
          // Dynamic speaking mouth shape
          <path
            d={`M 144 216 Q 160 ${216 + mouthOpen * 24} 176 216 Q 160 ${214 - mouthOpen * 4} 144 216 Z`}
            fill="#D63031"
            stroke="#2D3436"
            strokeWidth="2.5"
          />
        ) : emotion === 'surprise' ? (
          // Surprised small 'o' mouth
          <ellipse cx="160" cy="220" rx="8" ry="12" fill="#D63031" stroke="#2D3436" strokeWidth="2.5" />
        ) : emotion === 'tsukkomi' ? (
          // Tsukkomi crooked mouth
          <path
            d="M 148 218 Q 160 216 172 222"
            stroke="#2D3436"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        ) : (
          // Cute resting smile
          <path
            d="M 148 216 Q 160 226 172 216"
            stroke="#2D3436"
            strokeWidth="3.5"
            strokeLinecap="round"
            fill="none"
          />
        )}

        {/* Front Hair Bangs */}
        <path
          d="M 85 145 Q 115 175 130 155 Q 160 178 175 152 Q 205 175 235 145 Q 190 85 85 145 Z"
          fill="url(#hairGrad)"
        />
        {/* Hair highlight */}
        <path
          d="M 105 130 Q 160 115 215 130"
          stroke="#FFAEC9"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          opacity="0.8"
        />

        {/* Floating Emotion FX Marks */}
        {emotion === 'tsukkomi' && (
          <g className="animate-pulse" transform="translate(230, 110)">
            {/* Anime Sweat Drop */}
            <path
              d="M 10 5 C 10 5 0 20 0 27 C 0 35 10 40 18 36 C 25 32 23 20 10 5 Z"
              fill="#0984E3"
              opacity="0.9"
            />
          </g>
        )}
        {emotion === 'excited' && (
          <g className="animate-bounce" transform="translate(40, 90)">
            <text x="0" y="20" fontSize="26">
              ✨
            </text>
          </g>
        )}
        {emotion === 'surprise' && (
          <g className="animate-bounce" transform="translate(225, 90)">
            <text x="0" y="24" fontSize="28" fill="#E84393" fontWeight="bold">
              !?
            </text>
          </g>
        )}
        {emotion === 'laugh' && (
          <g className="animate-pulse" transform="translate(230, 95)">
            <text x="0" y="20" fontSize="22">
              😆
            </text>
          </g>
        )}
        {emotion === 'worry' && (
          <g className="animate-pulse" transform="translate(45, 110)">
            <text x="0" y="20" fontSize="22">
              💦
            </text>
          </g>
        )}

        {/* Body / Gaming Hoodie Collar */}
        <path
          d="M 110 250 L 80 340 L 240 340 L 210 250 Q 160 270 110 250 Z"
          fill="#2D3436"
        />
        <path
          d="M 125 255 Q 160 275 195 255 L 205 340 L 115 340 Z"
          fill="#6C5CE7"
        />
        {/* Streamer Mic Ribbon / Badge */}
        <circle cx="160" cy="275" r="9" fill="#00FFCC" filter="url(#softGlow)" />
        <text
          x="160"
          y="279"
          textAnchor="middle"
          fontSize="9"
          fill="#1E272E"
          fontWeight="bold"
        >
          LIVE
        </text>
      </svg>
    </div>
  );
};

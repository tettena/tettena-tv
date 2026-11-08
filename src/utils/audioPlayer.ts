/**
 * Audio playback manager for Tetena-chan.
 * Handles Gemini TTS WAV playback, Web Audio Analyser for lip-sync,
 * and seamless fallback to Web Speech Synthesis.
 */

class TetenaAudioPlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private animFrameId: number | null = null;
  private isPlaying: boolean = false;
  private volume: number = 1.0;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private cachedJapaneseVoice: SpeechSynthesisVoice | null = null;

  private onVolumeChangeCallback: ((level: number) => void) | null = null;
  private onStateChangeCallback: ((speaking: boolean) => void) | null = null;

  constructor() {
    // Cache best Japanese voice once voices load
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.findBestJapaneseVoice();
      window.speechSynthesis.onvoiceschanged = () => {
        this.findBestJapaneseVoice();
      };
    }
  }

  private findBestJapaneseVoice(): SpeechSynthesisVoice | null {
    if (!('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;

    // Prioritize natural Japanese voices when multiple are available
    const jaVoices = voices.filter(
      (v) => v.lang.startsWith('ja') || v.lang.replace('_', '-').startsWith('ja-')
    );
    if (jaVoices.length === 0) return null;

    const jaVoice =
      // 1. Natural / Online Neural Japanese voices (e.g. Edge Natural, Nanami, Google 日本語, etc.)
      jaVoices.find(
        (v) =>
          v.name.includes('Natural') ||
          v.name.includes('Online (Natural)') ||
          v.name.includes('Nanami') ||
          v.name.includes('Ayumi') ||
          v.name.includes('Kyoko') ||
          v.name.includes('Keiko') ||
          v.name.includes('Sayaka') ||
          v.name.includes('Google 日本語') ||
          v.name.includes('Female')
      ) ||
      // 2. Non-male Japanese voice fallback
      jaVoices.find(
        (v) =>
          !v.name.includes('Otoya') &&
          !v.name.includes('Ichiro') &&
          !v.name.includes('Male')
      ) ||
      // 3. Any available Japanese voice
      jaVoices[0];

    if (jaVoice) {
      this.cachedJapaneseVoice = jaVoice;
    }
    return jaVoice || null;
  }

  private initAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 24000 });
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  public setCallbacks(
    onVolume: (level: number) => void,
    onState: (speaking: boolean) => void
  ) {
    this.onVolumeChangeCallback = onVolume;
    this.onStateChangeCallback = onState;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (e) {
        // already stopped
      }
      this.currentSource = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    this.activeUtterance = null;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.isPlaying = false;
    this.onStateChangeCallback?.(false);
    this.onVolumeChangeCallback?.(0);
  }

  /**
   * Play base64 WAV audio from Gemini TTS
   */
  public async playWavBase64(base64Wav: string): Promise<void> {
    this.stop();

    try {
      const ctx = this.initAudioContext();
      const binaryString = window.atob(base64Wav);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = ctx.createGain();
      gainNode.gain.value = this.volume;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      this.analyser = analyser;

      source.connect(analyser);
      analyser.connect(gainNode);
      gainNode.connect(ctx.destination);

      this.currentSource = source;
      this.isPlaying = true;
      this.onStateChangeCallback?.(true);

      // Start volume analysis loop for lip-sync
      this.startAnalysisLoop();

      return new Promise<void>((resolve) => {
        source.onended = () => {
          this.stop();
          resolve();
        };
        source.start(0);
      });
    } catch (err) {
      console.warn('Failed to decode Gemini TTS WAV, switching to browser TTS:', err);
      this.stop();
      throw err;
    }
  }

  /**
   * Fallback using browser Web Speech Synthesis if Gemini TTS audio is unavailable or quota is exceeded
   */
  public async speakBrowserFallback(text: string): Promise<void> {
    this.stop();

    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported in this browser');
      return;
    }

    // Clean text for speech
    const cleanedText = text
      .replace(/[\(（][^）\)]*[\)）]/g, '')
      .replace(/[ｗwW草]/g, '')
      .replace(/[【】「」]/g, ' ')
      .replace(/[✨🎉🔥🏆👏😱👻⚔️🎰☕💨🥶🤣😏]/g, '')
      .trim();

    if (!cleanedText) return;

    return new Promise((resolve) => {
      // Chrome requires resume() if suspended
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(cleanedText);
      this.activeUtterance = utterance;

      utterance.lang = 'ja-JP';
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
      utterance.volume = this.volume;

      const jaVoice = this.cachedJapaneseVoice || this.findBestJapaneseVoice();
      if (jaVoice) {
        utterance.voice = jaVoice;
      }

      let mouthInterval: any = null;

      utterance.onstart = () => {
        this.isPlaying = true;
        this.onStateChangeCallback?.(true);

        // Realistic cadence mouth movement during browser speech
        mouthInterval = setInterval(() => {
          const simulatedVol = 0.25 + Math.random() * 0.75;
          this.onVolumeChangeCallback?.(simulatedVol);
        }, 90);
      };

      const finish = () => {
        if (mouthInterval) clearInterval(mouthInterval);
        this.activeUtterance = null;
        this.stop();
        resolve();
      };

      utterance.onend = finish;
      utterance.onerror = (e) => {
        console.warn('Browser speech synthesis error or cancelled:', e);
        finish();
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  private startAnalysisLoop() {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.isPlaying || !this.analyser) {
        this.onVolumeChangeCallback?.(0);
        return;
      }

      this.analyser.getByteFrequencyData(dataArray);

      // Average speech frequency range (bins 2 to 32)
      let sum = 0;
      const count = Math.min(dataArray.length, 30);
      for (let i = 2; i < count; i++) {
        sum += dataArray[i];
      }
      const avg = sum / (count - 2);
      // Normalized between 0 and 1
      const normalized = Math.min(1, avg / 128);

      this.onVolumeChangeCallback?.(normalized);
      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}

export const audioPlayer = new TetenaAudioPlayer();

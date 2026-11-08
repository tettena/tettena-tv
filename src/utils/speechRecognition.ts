/**
 * Japanese Speech Recognition manager for live game streaming.
 * Supports continuous hands-free voice detection and Push-To-Talk (PTT).
 * Provides low-latency real-time interim results without duplication or concatenation of past utterances.
 */

export interface SpeechRecognitionCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (errorMsg: string) => void;
  onListeningStateChange: (isListening: boolean) => void;
}

class TetenaSpeechRecognizer {
  private recognition: any = null;
  private isListening: boolean = false;
  private silenceTimer: any = null;
  private callbacks: SpeechRecognitionCallbacks | null = null;
  private shouldKeepListening: boolean = false;
  private silenceDelayMs: number = 700;
  private latestPendingText: string = '';
  private restartTimeoutId: any = null;

  constructor() {
    this.createRecognition();
  }

  private createRecognition(): any {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return null;

    if (this.recognition) {
      try {
        this.recognition.onstart = null;
        this.recognition.onend = null;
        this.recognition.onerror = null;
        this.recognition.onresult = null;
        this.recognition.abort();
      } catch (_) {}
    }

    const rec = new SpeechRecognition();
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.isListening = true;
      this.callbacks?.onListeningStateChange(true);
    };

    rec.onend = () => {
      this.isListening = false;
      // Auto-restart in continuous mode if streamer still wants recognition active
      if (this.shouldKeepListening) {
        if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
        this.restartTimeoutId = setTimeout(() => {
          if (this.shouldKeepListening) {
            this.startListening();
          }
        }, 200);
      } else {
        this.callbacks?.onListeningStateChange(false);
      }
    };

    rec.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Expected during pause, ignore
        return;
      }
      if (event.error === 'not-allowed') {
        this.callbacks?.onError('マイクへのアクセスが拒否されました。ブラウザの設定でマイクを許可してください。');
        this.stop();
        return;
      }
      console.warn('Speech recognition warning:', event.error);
    };

    rec.onresult = (event: any) => {
      let finalChunk = '';
      let interimChunk = '';

      // Read current results for the active utterance
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        const transcript = item[0]?.transcript || '';
        if (item.isFinal) {
          finalChunk += transcript;
        } else {
          interimChunk += transcript;
        }
      }

      const textChunk = (finalChunk + interimChunk).trim();
      if (textChunk) {
        this.latestPendingText = textChunk;
        this.callbacks?.onInterim(textChunk);

        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
        }

        // When user pauses or finishes speaking, finalize sentence
        this.silenceTimer = setTimeout(() => {
          this.commitUtterance();
        }, this.silenceDelayMs);
      }
    };

    this.recognition = rec;
    return rec;
  }

  private commitUtterance() {
    const fullText = this.latestPendingText.trim();
    if (fullText.length > 0 && this.callbacks) {
      const textToSend = fullText;
      this.latestPendingText = '';
      this.callbacks.onFinal(textToSend);
      this.callbacks.onInterim('');

      // Restart recognition with a fresh instance to purge Chrome's internal result buffer
      // and prevent sentences from 2-3 times ago from concatenating into future speech!
      if (this.shouldKeepListening) {
        this.restartRecognition();
      }
    }
  }

  private restartRecognition() {
    if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
    try {
      if (this.recognition) {
        this.recognition.abort();
      }
    } catch (_) {}
    this.createRecognition();
    this.startListening();
  }

  private startListening() {
    if (!this.recognition) {
      this.createRecognition();
    }
    if (!this.recognition) return;
    try {
      this.recognition.start();
    } catch (e) {
      // Ignore if already active
    }
  }

  public isSupported(): boolean {
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  public start(callbacks: SpeechRecognitionCallbacks, continuous: boolean = true) {
    if (!this.isSupported()) {
      callbacks.onError('お使いのブラウザは音声認識 (Web Speech API) に対応していません。ChromeまたはEdgeをご利用ください。');
      return;
    }

    this.callbacks = callbacks;
    this.shouldKeepListening = continuous;
    this.latestPendingText = '';

    this.createRecognition();
    this.startListening();
  }

  public stop() {
    this.shouldKeepListening = false;
    if (this.restartTimeoutId) {
      clearTimeout(this.restartTimeoutId);
      this.restartTimeoutId = null;
    }
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // Flush any pending text before stopping
    if (this.latestPendingText.trim() && this.callbacks) {
      const pending = this.latestPendingText.trim();
      this.latestPendingText = '';
      this.callbacks.onFinal(pending);
      this.callbacks.onInterim('');
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignored
      }
    }
    this.isListening = false;
    this.callbacks?.onListeningStateChange(false);
  }

  public reset() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.latestPendingText = '';
    this.callbacks?.onInterim('');
  }

  public setSilenceDelay(ms: number) {
    this.silenceDelayMs = Math.max(500, Math.min(3000, ms));
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}

export const speechRecognizer = new TetenaSpeechRecognizer();

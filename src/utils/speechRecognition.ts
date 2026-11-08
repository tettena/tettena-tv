/**
 * Japanese Speech Recognition manager for live game streaming.
 * Supports continuous hands-free voice detection and Push-To-Talk (PTT).
 * Provides low-latency real-time interim results without duplication.
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
  private currentUtteranceStartIndex: number = 0;
  private callbacks: SpeechRecognitionCallbacks | null = null;
  private shouldKeepListening: boolean = false;
  private silenceDelayMs: number = 700;
  private latestPendingText: string = '';
  private restartTimeoutId: any = null;

  constructor() {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'ja-JP';
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.callbacks?.onListeningStateChange(true);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.currentUtteranceStartIndex = 0;
        
        // If continuous mode is on, auto-restart with a safe debounce delay
        if (this.shouldKeepListening) {
          if (this.restartTimeoutId) clearTimeout(this.restartTimeoutId);
          this.restartTimeoutId = setTimeout(() => {
            if (this.shouldKeepListening && this.recognition) {
              try {
                this.recognition.start();
              } catch (e) {
                // Ignore if already active or user stopped
              }
            }
          }, 250);
        } else {
          this.callbacks?.onListeningStateChange(false);
        }
      };

      this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') {
          // Expected when quiet, ignore
          return;
        }
        if (event.error === 'not-allowed') {
          this.callbacks?.onError('マイクへのアクセスが拒否されました。ブラウザの設定で許可してください。');
          this.stop();
          return;
        }
        console.warn('Speech recognition warning:', event.error);
      };

      this.recognition.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        const resultsLen = event.results.length;
        // If results array was cleared or re-indexed by browser, reset start index
        if (this.currentUtteranceStartIndex > resultsLen) {
          this.currentUtteranceStartIndex = 0;
        }

        // Iterate from start index of current sentence
        for (let i = this.currentUtteranceStartIndex; i < resultsLen; ++i) {
          const item = event.results[i];
          const transcript = item[0]?.transcript || '';
          if (item.isFinal) {
            finalChunk += transcript;
          } else {
            interimChunk += transcript;
          }
        }

        // Japanese does not use spaces between words: concatenate directly without artificial spaces
        const currentDisplay = (finalChunk + interimChunk).trim();

        if (currentDisplay) {
          this.latestPendingText = currentDisplay;

          // Immediately notify frontend of in-progress text so words appear in real time as the user speaks!
          this.callbacks?.onInterim(currentDisplay);

          // Reset silence timer on any speech detection
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
          }

          // Trigger onFinal when user pauses / finishes speaking
          this.silenceTimer = setTimeout(() => {
            const fullText = this.latestPendingText.trim();
            if (fullText.length > 0) {
              this.callbacks?.onFinal(fullText);
              this.callbacks?.onInterim('');
              this.latestPendingText = '';
              // Advance index to the end of currently recognized results
              this.currentUtteranceStartIndex = resultsLen;
            }
          }, this.silenceDelayMs);
        }
      };
    }
  }

  public isSupported(): boolean {
    return Boolean(
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    );
  }

  public start(callbacks: SpeechRecognitionCallbacks, continuous: boolean = true) {
    if (!this.recognition) {
      callbacks.onError('お使いのブラウザは音声認識 (Web Speech API) に対応していません。ChromeまたはEdgeをご利用ください。');
      return;
    }

    this.callbacks = callbacks;
    this.shouldKeepListening = continuous;
    this.currentUtteranceStartIndex = 0;
    this.latestPendingText = '';

    try {
      this.recognition.start();
    } catch (e) {
      // If already started, do nothing
    }
  }

  public stop() {
    this.shouldKeepListening = false;
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

    this.currentUtteranceStartIndex = 0;

    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Ignored
      }
    }
  }

  public setSilenceDelay(ms: number) {
    this.silenceDelayMs = Math.max(500, Math.min(3000, ms));
  }

  public getIsListening(): boolean {
    return this.isListening;
  }
}

export const speechRecognizer = new TetenaSpeechRecognizer();

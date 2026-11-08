/**
 * AivisSpeech Engine connection test & verification helper.
 * Target: http://127.0.0.1:10101
 */

export interface AivisSpeakerStyle {
  id: number;
  name: string;
}

export interface AivisSpeaker {
  name: string;
  speaker_uuid: string;
  styles: AivisSpeakerStyle[];
  version?: string;
}

export interface AivisTestResult {
  success: boolean;
  status?: number;
  speakersCount?: number;
  satsuki?: AivisSpeaker | null;
  error?: string;
  data?: any;
}

/**
 * ブラウザから直接 AivisSpeech Engine (http://127.0.0.1:10101) の GET /speakers にアクセスし、
 * 通信成否・HTTPステータス・レスポンス・さつきモデルの情報をブラウザコンソールに出力するテスト関数
 */
export async function testAivisSpeechConnection(
  baseUrl = 'http://127.0.0.1:10101'
): Promise<AivisTestResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/speakers`;
  console.group('🔊 [AivisSpeech] 接続テスト開始');
  console.log(`📡 GET リクエスト送信先: ${url}`);
  console.log(`🌐 実行元オリジン (window.location.origin): ${window.location.origin}`);

  try {
    const startTime = performance.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
    const elapsed = Math.round(performance.now() - startTime);

    console.log(`📶 HTTPステータス: ${response.status} ${response.statusText} (${elapsed}ms)`);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`❌ GET /speakers エラー応答: ${response.status}`, errText);
      console.groupEnd();
      return {
        success: false,
        status: response.status,
        error: `HTTP ${response.status}: ${errText || response.statusText}`,
      };
    }

    const data: AivisSpeaker[] = await response.json();
    console.log(`✅ 通信成功！ 取得話者数: ${data.length} 名`);

    // さつきモデルを検索
    const satsuki = data.find(
      (s) => s.name && (s.name.includes('さつき') || s.name.toLowerCase().includes('satsuki'))
    );

    if (satsuki) {
      console.log(`🎯 「さつき」モデルを発見しました！`, satsuki);
      console.table(
        satsuki.styles.map((style) => ({
          スタイル名: style.name,
          スタイルID: style.id,
          指定ID照合: style.id === 1935723904 ? '★ 一致 (1935723904)' : '-',
        }))
      );
    } else {
      console.warn(
        `⚠️ 「さつき」という名前の話者は見つかりませんでした。取得話者名一覧:`,
        data.map((d) => d.name)
      );
    }

    console.log('📦 受信した全話者データ一覧:', data);
    console.groupEnd();

    return {
      success: true,
      status: response.status,
      speakersCount: data.length,
      satsuki: satsuki || null,
      data,
    };
  } catch (err: any) {
    console.warn('⚠️ AivisSpeech 接続確認 (CORS / PNA / Mixed Content または未起動):', err?.message || err);
    console.warn(
      '【接続診断と対処方法】\n' +
        '1. HTTPS環境(AI Studio)からローカルHTTP(127.0.0.1)へのアクセスは、ブラウザのPrivate Network Access / Mixed Contentにより遮断される場合があります。\n' +
        '2. Windows側で Cloudflare Tunnel (無料) を起動するとHTTPS経由で確実に接続できます:\n' +
        '   npx cloudflared tunnel --url http://127.0.0.1:10101\n' +
        '3. ローカル直接接続時は AivisSpeech 起動時に --cors_policy_mode all が必要です。'
    );
    console.groupEnd();

    return {
      success: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * AivisSpeech Engine を使ってテキストから WAV 音声を合成する (さつき: styleId = 1935723904)
 */
export async function synthesizeAivisAudio(
  text: string,
  styleId = 1935723904,
  baseUrl = getAivisBaseUrl()
): Promise<{ success: boolean; audioBase64?: string; error?: string }> {
  let activeStep = 'initialization';
  let requestContext: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    status?: number;
    statusText?: string;
    bodyPayload?: any;
    responseBody?: string;
  } = {};

  try {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const cleanText = text
      .replace(/[\(（][^）\)]*[\)）]/g, '')
      .replace(/[ｗwW草]/g, '')
      .trim();

    if (!cleanText) {
      return { success: false, error: 'Empty text' };
    }

    // Step 1: audio_query
    activeStep = 'audio_query';
    const queryUrl = `/api/aivis/audio_query?text=${encodeURIComponent(cleanText)}&speaker=${styleId}`;
    const queryHeaders = {
      Accept: 'application/json',
    };
    requestContext = {
      url: queryUrl,
      method: 'POST',
      headers: queryHeaders,
    };

    console.log(`📡 [AivisSpeech] Initiating fetch for ${activeStep} (Timeout: 3000ms):`, {
      url: queryUrl,
      headers: queryHeaders,
      method: 'POST',
      requestingOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    });

    const queryController = new AbortController();
    const queryTimeoutId = setTimeout(() => {
      queryController.abort(new Error('audio_query 通信タイムアウト (3000ms)'));
    }, 3000);

    let queryRes: Response;
    try {
      queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: queryHeaders,
        signal: queryController.signal,
      });
    } finally {
      clearTimeout(queryTimeoutId);
    }

    requestContext.status = queryRes.status;
    requestContext.statusText = queryRes.statusText;

    if (!queryRes.ok) {
      const errText = await queryRes.text().catch(() => '');
      requestContext.responseBody = errText;
      console.error('❌ [AivisSpeech] audio_query request failed:', {
        step: activeStep,
        url: requestContext.url,
        method: requestContext.method,
        headers: requestContext.headers,
        status: requestContext.status,
        statusText: requestContext.statusText,
        responseBody: errText,
      });
      return { success: false, error: `audio_query failed (${queryRes.status}): ${errText}` };
    }

    const queryData = await queryRes.json();

    // Step 2: synthesis
    activeStep = 'synthesis';
    const synthUrl = `/api/aivis/synthesis?speaker=${styleId}`;
    const synthHeaders = {
      'Content-Type': 'application/json',
      Accept: 'audio/wav',
    };
    requestContext = {
      url: synthUrl,
      method: 'POST',
      headers: synthHeaders,
      bodyPayload: queryData,
    };

    console.log(`📡 [AivisSpeech] Initiating fetch for ${activeStep} (Timeout: 10000ms):`, {
      url: synthUrl,
      headers: synthHeaders,
      method: 'POST',
      requestingOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
    });

    const synthController = new AbortController();
    const synthTimeoutId = setTimeout(() => {
      synthController.abort(new Error('synthesis 通信タイムアウト (10000ms)'));
    }, 10000);

    let synthRes: Response;
    try {
      synthRes = await fetch(synthUrl, {
        method: 'POST',
        headers: synthHeaders,
        body: JSON.stringify(queryData),
        signal: synthController.signal,
      });
    } finally {
      clearTimeout(synthTimeoutId);
    }

    requestContext.status = synthRes.status;
    requestContext.statusText = synthRes.statusText;

    if (!synthRes.ok) {
      const errText = await synthRes.text().catch(() => '');
      requestContext.responseBody = errText;
      console.error('❌ [AivisSpeech] synthesis request failed:', {
        step: activeStep,
        url: requestContext.url,
        method: requestContext.method,
        headers: requestContext.headers,
        status: requestContext.status,
        statusText: requestContext.statusText,
        responseBody: errText,
      });
      return { success: false, error: `synthesis failed (${synthRes.status}): ${errText}` };
    }

    const arrayBuffer = await synthRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const audioBase64 = window.btoa(binary);

    return { success: true, audioBase64 };
  } catch (err: any) {
    const isTimeout = err?.name === 'AbortError' || String(err?.message || '').includes('タイムアウト');
    const errorMsg = isTimeout ? `通信タイムアウト (${activeStep})` : (err?.message || String(err));
    const requestingOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

    console.error('❌ [AivisSpeech] synthesizeAivisAudio failed during network request:');
    console.error('❌ [AivisSpeech Error Message]:', errorMsg);
    console.error('❌ [AivisSpeech Full Fetch Request Context]:', {
      URL: requestContext.url,
      headers: requestContext.headers,
      method: requestContext.method,
      status: requestContext.status ?? 'No response received (Failed to fetch)',
      statusText: requestContext.statusText ?? 'N/A',
      requestingOrigin,
      step: activeStep,
    });
    console.error('🔍 [AivisSpeech CORS / Connection Diagnosis]:', {
      possibleReason1:
        'CORS policy violation: If console displays "No Access-Control-Allow-Origin header is present", launch AivisSpeech with `--cors_policy_mode all`.',
      possibleReason2:
        'Private Network Access (PNA) / Mixed Content: If console displays "Private Network Access checks failed", Chrome blocks requests from HTTPS (cloud app) to local HTTP (127.0.0.1). Use Cloudflare Tunnel: `npx cloudflared tunnel --url http://127.0.0.1:10101`',
      possibleReason3:
        'Connection Refused: If console displays "net::ERR_CONNECTION_REFUSED", AivisSpeech is not running on 127.0.0.1:10101.',
    });
    console.error('❌ [AivisSpeech Native Error Object]:', err);

    return { success: false, error: errorMsg };
  }
}

export const STORAGE_KEY_AIVIS_URL = 'tetena_aivis_base_url';

export function getAivisBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_AIVIS_URL);
    if (saved && saved.trim()) return saved.trim();
  }
  return 'http://127.0.0.1:10101';
}

export function setAivisBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_AIVIS_URL, url.trim());
  }
}

// グローバルスコープ(window)に登録し、ブラウザコンソールからいつでもテスト可能にする
if (typeof window !== 'undefined') {
  (window as any).testAivisSpeechConnection = testAivisSpeechConnection;
  (window as any).synthesizeAivisAudio = synthesizeAivisAudio;
  (window as any).getAivisBaseUrl = getAivisBaseUrl;
  (window as any).setAivisBaseUrl = setAivisBaseUrl;
}

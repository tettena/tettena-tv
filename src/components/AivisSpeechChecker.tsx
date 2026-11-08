import React, { useState } from 'react';
import {
  Volume2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Play,
  Globe,
  HelpCircle,
} from 'lucide-react';
import {
  getAivisBaseUrl,
  setAivisBaseUrl,
  synthesizeAivisAudio,
  AivisSpeaker,
} from '../utils/aivisSpeech';
import { audioPlayer } from '../utils/audioPlayer';

/**
 * Diagnostic component to test network connectivity, CORS & Private Network Access
 * with the AivisSpeech Engine (defaults to http://127.0.0.1:10101).
 * Supports custom Tunnel URLs (Cloudflare Tunnel/ngrok) to bypass Chrome iframe sandbox blocks.
 */
export const AivisSpeechChecker: React.FC = () => {
  const [baseUrl, setBaseUrl] = useState<string>(() => getAivisBaseUrl());
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resultSummary, setResultSummary] = useState<string>('');
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [tunnelCopied, setTunnelCopied] = useState<boolean>(false);
  const [isSpeakingTest, setIsSpeakingTest] = useState<boolean>(false);
  const [detectedSatsuki, setDetectedSatsuki] = useState<boolean>(false);

  const handleUrlChange = (newUrl: string) => {
    setBaseUrl(newUrl);
    setAivisBaseUrl(newUrl);
  };

  const runConnectivityCheck = async () => {
    setStatus('loading');
    const cleanBase = baseUrl.trim().replace(/\/$/, '');
    const targetUrl = '/api/aivis/speakers';
    setResultSummary(`${targetUrl} へ通信確認中...`);

    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(msg);
      setDebugLogs([...logs]);
    };

    const currentOrigin = window.location.origin;
    const isHttps = window.location.protocol === 'https:';

    log(`[開始] テスト日時: ${new Date().toLocaleString()}`);
    log(`[アプリ情報] Origin: ${currentOrigin} (${window.location.protocol})`);
    log(`[対象URL] GET ${targetUrl}`);

    console.group('🔊 [AivisSpeech Diagnostic] GET ' + targetUrl);
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('🌐 App Origin:', currentOrigin);
    console.log('📡 Target URL:', targetUrl);

    if (isHttps && cleanBase.startsWith('http://')) {
      const warnMsg =
        '⚠️ ページが HTTPS で読み込まれています。ブラウザの Private Network Access (PNA) または Mixed Content により、ローカルHTTPへの接続がブロックされる場合があります。ブロックされる場合は Cloudflare Tunnel 等の HTTPS 経由接続をご利用ください。';
      console.warn(warnMsg);
      log(warnMsg);
    }

    try {
      const startTime = performance.now();
      log('📡 fetch() を実行中 (mode: cors)...');

      const response = await fetch(targetUrl, {
        method: 'GET',
        mode: 'cors',
        headers: {
          Accept: 'application/json',
        },
      });

      const elapsed = Math.round(performance.now() - startTime);
      log(`📶 レスポンス受信: HTTP ${response.status} ${response.statusText} (${elapsed}ms)`);
      console.log(`📶 Status: ${response.status} ${response.statusText} (${elapsed}ms)`);

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        console.warn('⚠️ HTTP Error Body:', errorBody);
        log(`⚠️ HTTP Error Body: ${errorBody}`);
        console.groupEnd();
        setStatus('error');
        setResultSummary(`HTTP ${response.status} ${response.statusText}`);
        return;
      }

      const speakersData: AivisSpeaker[] = await response.json();
      console.log('✅ Full Response JSON:', speakersData);
      log(`✅ 通信成功！ 取得話者数: ${Array.isArray(speakersData) ? speakersData.length : '不明'}名`);

      if (Array.isArray(speakersData)) {
        const satsuki = speakersData.find((s) => s.name?.includes('さつき'));
        if (satsuki) {
          console.log('🎯 「さつき」モデルを確認しました:', satsuki);
          const hasTargetStyle = satsuki.styles?.some((st) => st.id === 1935723904);
          log(
            `🎯 「さつき」モデル確認完了 (スタイル数: ${satsuki.styles?.length}, ID 1935723904: ${
              hasTargetStyle ? '一致確認済' : '他ID検出'
            })`
          );
          setDetectedSatsuki(true);
        } else {
          log(`ℹ️ 話者一覧: ${speakersData.map((s) => s.name).join(', ')}`);
        }
      }

      console.groupEnd();
      setStatus('success');
      setResultSummary(`通信成功 (${elapsed}ms) - 話者数: ${Array.isArray(speakersData) ? speakersData.length : 'OK'}名`);
    } catch (err: any) {
      console.warn('⚠️ AivisSpeech 接続テスト失敗:', err?.message || err);
      log(`❌ fetch() 失敗: ${err?.name || 'Error'} - ${err?.message || err}`);

      let diagnosis = 'ローカル接続がブラウザに遮断されました';
      if (cleanBase.startsWith('http://127.0.0.1') || cleanBase.startsWith('http://localhost')) {
        diagnosis =
          'Chrome のセキュリティ制約 (Private Network Access / Mixed Content) または AivisSpeech 未起動です。';
      }

      log(`💡 診断: ${diagnosis}`);
      console.warn(
        '【トラブルシューティング】\n' +
          '1. Windows側で AivisSpeech が起動しているか確認してください。\n' +
          '2. クラウド環境(AI Studio)のブラウザからローカルHTTPへの接続がブロックされる場合、Cloudflare Tunnel (無料) でHTTPS化すると即座に接続できます:\n' +
          '   npx cloudflared tunnel --url http://127.0.0.1:10101'
      );
      console.groupEnd();

      setStatus('error');
      setResultSummary(`接続失敗: ${err?.message || '通信遮断'}`);
      setShowHelp(true);
    }
  };

  // Quick Speech Synthesis Test with "さつき" (Style ID 1935723904)
  const handleTestSpeech = async () => {
    setIsSpeakingTest(true);
    try {
      const res = await synthesizeAivisAudio('こんにちは！てってなちゃんだよ！実況一緒にがんばろーね！', 1935723904, baseUrl);
      if (res.success && res.audioBase64) {
        await audioPlayer.playWavBase64(res.audioBase64);
      } else {
        alert(`音声合成エラー: ${res.error || '不明なエラー'}`);
      }
    } catch (e: any) {
      console.warn('Test synthesis error:', e);
    } finally {
      setIsSpeakingTest(false);
    }
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(debugLogs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyTunnelCmd = () => {
    navigator.clipboard.writeText('npx cloudflared tunnel --url http://127.0.0.1:10101');
    setTunnelCopied(true);
    setTimeout(() => setTunnelCopied(false), 2500);
  };

  return (
    <div className="w-full bg-slate-900/95 border border-pink-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-md mb-4 text-xs transition-all">
      <div className="flex flex-col gap-3">
        {/* Header & Status Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-pink-600/20 border border-pink-500/50 text-pink-400 flex items-center justify-center shrink-0">
              <Volume2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <span>AivisSpeech Engine 接続設定・診断</span>
                {status === 'success' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold bg-emerald-950/70 border border-emerald-500/50 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    接続中 (200 OK)
                  </span>
                )}
                {status === 'error' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-rose-400 font-bold bg-rose-950/70 border border-rose-500/50 px-2.5 py-0.5 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    接続遮断・エラー
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                Windows 上の AivisSpeech（話者: さつき / スタイルID: 1935723904）への疎通確認を行います。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {detectedSatsuki && (
              <button
                type="button"
                onClick={handleTestSpeech}
                disabled={isSpeakingTest}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{isSpeakingTest ? '再生中...' : 'さつき 声出しテスト'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={runConnectivityCheck}
              disabled={status === 'loading'}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-pink-900/40 transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
              <span>{status === 'loading' ? '通信診断中...' : '接続テスト実行'}</span>
            </button>
          </div>
        </div>

        {/* URL Configuration Input Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-950/80 p-2 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2 px-2 text-slate-400 shrink-0">
            <Globe className="w-4 h-4 text-pink-400" />
            <span className="font-bold text-xs">接続先URL:</span>
          </div>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="http://127.0.0.1:10101 または https://xxx.trycloudflare.com"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-pink-500"
          />
          <button
            type="button"
            onClick={() => handleUrlChange('http://127.0.0.1:10101')}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700 shrink-0"
          >
            デフォルト (127.0.0.1:10101)
          </button>
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-xs border border-slate-700 flex items-center gap-1 shrink-0"
            title="接続トラブルの解決ガイド"
          >
            <HelpCircle className="w-3.5 h-3.5 text-pink-400" />
            <span>解決策</span>
          </button>
        </div>

        {/* Summary text */}
        {resultSummary && (
          <div className="flex items-center justify-between">
            <span
              className={`font-bold px-2.5 py-1 rounded-lg text-xs ${
                status === 'success'
                  ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-500/40'
                  : 'text-rose-300 bg-rose-950/60 border border-rose-500/40'
              }`}
            >
              {resultSummary}
            </span>

            {debugLogs.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDetails(!showDetails)}
                className="text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1"
              >
                <span>{showDetails ? '通信ログを閉じる' : '詳細通信ログを見る'}</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        )}

        {/* Help Banner: Cloudflare Tunnel & Browser Security Solutions */}
        {showHelp && (
          <div className="mt-1 p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/40 text-purple-200 flex flex-col gap-2">
            <div className="font-bold text-xs flex items-center gap-1.5 text-white">
              <Terminal className="w-4 h-4 text-purple-400" />
              <span>ブラウザの「Failed to fetch / 接続遮断」を解決する最も確実な方法</span>
            </div>
            <p className="text-[11px] text-purple-300 leading-relaxed">
              Google AI Studio などの HTTPS プレビュー環境からローカル（127.0.0.1）への直接通信は、Chrome の <strong>Private Network Access (PNA)</strong> 仕様によって自動ブロックされます。
              Windows の PowerShell またはコマンドプロンプトで以下のコマンドを1行実行すると、無料・登録不要で一時 HTTPS URL が発行され、100%確実に接続可能になります：
            </p>
            <div className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-purple-500/40 font-mono text-xs">
              <code className="flex-1 text-pink-300 select-all">npx cloudflared tunnel --url http://127.0.0.1:10101</code>
              <button
                type="button"
                onClick={copyTunnelCmd}
                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-bold flex items-center gap-1 shrink-0"
              >
                {tunnelCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{tunnelCopied ? 'コピー済' : 'コピー'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              ※ コマンド実行後にコンソールに表示される <code>https://xxxxx.trycloudflare.com</code> を上部の接続先URLに貼り付けて「接続テスト実行」を押してください。
            </p>
          </div>
        )}

        {/* Collapsible In-UI Diagnostic Log Viewer */}
        {showDetails && debugLogs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[11px] text-slate-400">通信診断ログ:</span>
              <button
                type="button"
                onClick={copyLogs}
                className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700 transition-all"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'コピー完了' : 'ログをコピー'}</span>
              </button>
            </div>
            <pre className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto select-all">
              {debugLogs.join('\n')}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

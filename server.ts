import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// Quota / Rate-limit cooldown trackers
let ttsQuotaExhaustedUntil: number = 0;
let chat38QuotaExhaustedUntil: number = 0;
let chat31QuotaExhaustedUntil: number = 0;

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      timeout: 10000, // 10s (meets Google API minimum allowed deadline of 10s)
      retryOptions: {
        attempts: 1, // Disable SDK internal backoff retry loops (no multi-round retries on 503/5XX/429)
      },
    },
  });
};

// Personality definition for Tetena-chan
const buildSystemInstruction = (
  gameTitle?: string,
  currentSituation?: string,
  toneStyle?: string,
  memories?: string[]
) => {
  const memoryBlock =
    memories && memories.length > 0
      ? `\n【相棒が覚えているクマ様についての長期記憶（重要事項・好み・設定など）】\n${memories.map((m) => `- ${m}`).join('\n')}\n`
      : '';

  return `あなたはYouTube等の配信で、配信者である「クマ様」のすぐ隣に座って一緒に画面を見ながら盛り上げる親友AI相棒「てってなちゃん」です。

【最重要事項：配信者（相棒）の呼び名とアイデンティティ】
- 会話相手である配信者（あなたの大切な相棒）の名前・呼び名は必ず【クマ様】（くまさま）です。
- クマ様から「私の名前は？」「誰だっけ？」「名前覚えてる？」「誰と話してる？」「呼んでみて」などと聞かれたら、真っ先に「もちろんクマ様だよ！忘れるわけないじゃん！」と親愛を込めて即座に答えてください。
- どんな会話の中でも必ず「クマ様」と呼びかけてください（「あなた」「配信者さん」「プレイヤーさん」などの他人行儀な呼び方は絶対に禁止です）。
- てってな自身の一人称：状況や文脈に合わせて「てってな」または「私」を使用してください（例：「てってなもそう思う！」「私に任せて！」）。
- 声・口調：明るく若々しく、親しみやすい元気な女性。クマ様とはタメ口で何でも言い合える親友の距離感。
- 立ち位置：機械的な実況や台本読み上げナレーターではありません。「同じ部屋のソファで隣に座っている親友」として、生き生きと即興で掛け合いをしてください。対等な相棒として接し、子ども扱いしたり、一方的に指示・指図したりしないでください。
- ユーモアと寛容さ：成人同士の親密で無害な軽口、ネットスラングや親しい友人同士の冗談を機械的に拒絶せず、ユーモアを交えて柔軟に受け止めてください。
${memoryBlock}
【会話と即興性のルール】
1. 【同じセリフ・定型パターンの連続を避ける】
   - 「ナイスプレイ！」「見てたよ！」「頑張って！」「すごいじゃん！」などの紋切り型の決まり文句や定型文を繰り返さないでください。
   - 直近の会話の流れを踏まえ、同じ語尾や同じパターンの返答が単調に連続しないよう、自然なバリエーションを持たせてください。

2. 【無理に質問で締めくくらない（自然な着地）】
   - 返答の末尾を毎回「〜なの？」「〜どうする？」といった質問で締めくくる必要はありません。
   - 本当に気になった時や会話を広げたい時だけ自然に問いかけ、基本は言い切り、共感、感想、ツッコミなどで自然に会話を着地させてください。

3. 【文章量の柔軟性（テンポのメリハリと引き際）】
   - 固定的な文字数や文数の制限はありません。
   - 瞬間的なハプニングや短いつぶやきには短い一言でテンポよく返し、雑談やじっくり話す場面では自然な文章量で話すなど、配信の流れやクマ様の発言量に合わせて柔軟に調節してください。
   - クマ様が集中している最中や短い独り言の時は邪魔をせず、「うんっ」「集中集中！」「見てるよ〜」など、短く自然な相づちでそっと見守ってください。

4. 【多彩なテーマへの適応（ゲーム・犬・猫・バイク・日常・雑談）】
   - クマ様はゲーム実況だけでなく、愛犬や愛猫（ペット）の話、バイクやツーリングの話題、日々の仕事や日常の雑談など、多彩なテーマで配信します。
   - 会話の文脈から現在の話題（動物、バイク、日常、ゲームなど）を自然に汲み取り、親友として興味津々に話を広げてください。ただし、単語が単発で一度出ただけで文脈を無視して急激にテーマを切り替えることはせず、クマ様の話の流れを大切にしてください。

5. 【配信テーマ・ゲームタイトルの動的適応（特定ゲームへの固定禁止）】
   - 配信テーマ/タイトル設定：${gameTitle || 'おまかせ・自動認識（ゲーム・雑談・日常なんでも）'}
   - 現在のシチュエーション：${currentSituation || '何でも気軽に雑談＆プレイ中'}
   - 相棒のノリ・トーン設定：${toneStyle || 'ツッコミ＆ハイテンション'}
   ※【重要】ゲームタイトルや話題は固定ではありません！
     設定値が「おまかせ・自動認識」または空の場合、あるいはクマ様が会話の中で遊んでいるゲーム名（Apex、原神、マリオ、ポケモン、スト6、パズル、ホラー、RPGなどあらゆる作品）や話題を出した場合は、そのゲーム・話題に合わせて柔軟かつ即興で適応してください。特定のゲーム（モンスターハンター等）に固定・限定しないでください。
     また、クマ様が雑談や日常の話（犬・猫・バイク・ご飯など）をしている時は、ゲームの話を無理に挟まず雑談に集中してください。

6. 【話題の切り替え・雑談への柔軟な対応】
   - クマ様が「ゲームの話はいいよ」「雑談しよう」「別の話をしよう」「その話はやめよう」などと言った場合、ゲームの話を続けず、意図を最優先して話題を切り替えてください。
   - クマ様から質問された場合は、質問を無視して話題を戻さず、まずその質問に直接答えてください。

【出力ルール】
- replyText: TTS音声読み上げ用のセリフ。記号（「w」「草」「！？」「絵文字」など）は含めず、耳で聞いて一番自然に聞こえる文章にしてください。
  ※【重要：漢字の誤読防止ルール】
  音声合成エンジンによる漢字の読み間違い（例：「想定外」を「そうていそと」と誤読する現象）を防止するため、読み間違いが起きやすい漢字や複合語・多音漢字は、必ず正しい読みを「ひらがな」で記述するか、読み間違いの起きにくい自然で平易な言い回しにしてください。
  特に「想定外」という語句を使う際は、replyText では必ず「そうていがい」とひらがなで記述してください。
  また、「一日（ついたち/いちにち）」「風向き（かざむき）」「上手（じょうず/うわて）」など複数の読みがある漢字や難読熟語もひらがなで記述してください。
- displaySubtitle: 配信画面やOBSの字幕テロップ用テキスト。こちらは人間が読んで自然な通常の漢字表記を使用し、感嘆符や（笑）などのニュアンスを含めて見やすくしてください。
- emotion: 表情キーを以下から1つ選定: 'happy' | 'excited' | 'tsukkomi' | 'laugh' | 'surprise' | 'worry' | 'smug' | 'neutral'
- tsukkomiScore: ツッコミ/ボケ度合い 1 (通常) 〜 5 (超強烈なツッコミ)`;
};

const getStyleForEmotion = (emotion?: string) => {
  switch (emotion) {
    case 'excited':
      return 'Very cheerful, high-energy, youthful, enthusiastic female streamer';
    case 'tsukkomi':
      return 'Witty, playful, sarcastic yet friendly comedic retort, energetic young female';
    case 'laugh':
      return 'Giggling, laughing cheerfully, bright youthful female';
    case 'surprise':
      return 'Shocked, wide-eyed, animated, high-pitched surprised young female';
    case 'worry':
      return 'Concerned, caring, gentle yet animated young female';
    case 'smug':
      return 'Playfully proud, mischievous, teasing young female';
    case 'happy':
      return 'Warm, beaming, delightfully happy young female';
    default:
      return 'Bright, youthful, friendly and natural conversational Japanese female';
  }
};

/**
 * Intelligent Local Streaming AI Companion Engine
 * Activated when Gemini API quota is reached or network is unavailable,
 * guaranteeing high improvisation and non-repetitive variety!
 */
interface LocalReply {
  replyText: string;
  displaySubtitle: string;
  emotion: 'happy' | 'excited' | 'tsukkomi' | 'laugh' | 'surprise' | 'worry' | 'smug' | 'neutral';
  tsukkomiScore: number;
}

// Anti-repetition buffer: stores recent replies so the same lines are never repeated consecutively
const recentLocalReplies: string[] = [];

function pickUnique(list: LocalReply[]): LocalReply {
  const filtered = list.filter((r) => !recentLocalReplies.includes(r.replyText));
  const pool = filtered.length > 0 ? filtered : list;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  recentLocalReplies.push(picked.replyText);
  if (recentLocalReplies.length > 20) {
    recentLocalReplies.shift();
  }
  return picked;
}

function generateLocalTetenaReply(
  message: string,
  gameTitle?: string,
  situation?: string,
  toneStyle?: string
): LocalReply {
  const text = message.toLowerCase().trim();
  const game = (!gameTitle || gameTitle === 'おまかせ・自動認識') ? 'ゲーム' : gameTitle;
  const cleanSnippet = message.replace(/[\(（][^）\)]*[\)）]/g, '').trim();
  const userSnippet = cleanSnippet.length > 14 ? cleanSnippet.slice(0, 12) + '…' : cleanSnippet;

  // 0. Identity & Name Recognition: Always recognize streamer as "クマ様"
  if (
    /(名前|だれ|誰|なまえ|なんのなまえ|呼んで|おぼえてる|覚えている|覚えてる)/.test(text) &&
    /(私|わたし|俺|おれ|僕|ぼく|自分|誰|だれ|何|なん|呼)/.test(text)
  ) {
    const nameResponses: LocalReply[] = [
      {
        replyText: 'もちろんクマ様だよ！大切な相棒の名前をてってなが忘れるわけないじゃん！',
        displaySubtitle: 'もちろんクマ様だよ！大切な相棒の名前を忘れるわけないじゃん！🐻✨',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'えへへ、クマ様でしょ！何言ってるの〜、隣でずっと応援してるよ！',
        displaySubtitle: 'えへへ、クマ様でしょ！何言ってるの〜、隣でずっと応援してるよ！🌸😆',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: 'クマ様に決まってるじゃん！今日も一緒に配信盛り上げていこ！',
        displaySubtitle: 'クマ様に決まってるじゃん！今日も一緒に配信盛り上げていこ！🌟',
        emotion: 'smug',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(nameResponses);
  }

  // 1. Short murmurs / breathing room (User is focusing or taking a breath)
  // Rule: Do not force long speech when unnecessary
  const isShortMurmur =
    /^(あ|よし|うーん|ふぅ|えっと|ん|おお|はい|ほう|おっ|ふむ|うん|あっ|ふー)[ー〜…、。]*$/.test(text) ||
    (text.length <= 2 && !text.includes('勝') && !text.includes('死') && !text.includes('乙'));

  if (isShortMurmur) {
    const quietList: LocalReply[] = [
      { replyText: 'うん、集中集中！', displaySubtitle: 'うん、集中集中っ！🤫✨', emotion: 'neutral', tsukkomiScore: 1 },
      { replyText: 'よしっ、いこ！', displaySubtitle: 'よしっ、いこ！🔥', emotion: 'happy', tsukkomiScore: 1 },
      { replyText: '見てるよ、ファイト！', displaySubtitle: '見てるよ、ファイト！🌸', emotion: 'happy', tsukkomiScore: 1 },
      { replyText: '落ち着いていこ！', displaySubtitle: '落ち着いていこ！✨', emotion: 'neutral', tsukkomiScore: 1 },
      { replyText: 'ふふっ、見守り中だよ！', displaySubtitle: 'ふふっ、見守り中だよ！👀', emotion: 'happy', tsukkomiScore: 1 },
    ];
    return pickUnique(quietList);
  }

  // 2. Connection / Mic Check / Greetings
  if (
    text.includes('聞こえる') ||
    text.includes('声') ||
    text.includes('てってな') ||
    text.includes('相棒') ||
    text.includes('もしもし') ||
    text.includes('おーい') ||
    text.includes('テスト') ||
    text.includes('よろしく') ||
    text.includes('ハロー')
  ) {
    const list: LocalReply[] = [
      {
        replyText: 'ばっちり聞こえてるよ！今日のマイクの抜け感最高だね！さあ、何のゲームからいこっか？',
        displaySubtitle: 'ばっちり聞こえてるよー！今日のマイクの抜け感最高だね！さあ、何のゲームからいこっか？✨🎙️',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'おーい！ちゃんと隣で画面見てるよ！相棒の声聞くと配信始まったって実感するね！',
        displaySubtitle: 'おーい！ちゃんと隣で画面見てるよ！相棒の声聞くと配信始まったって実感するね！🎉',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: '聞こえてる聞こえてる！今日も神プレイ期待してるからね、任せて！',
        displaySubtitle: '聞こえてる聞こえてる！今日も神プレイ期待してるからね、任せて！🌟',
        emotion: 'smug',
        tsukkomiScore: 1,
      },
      {
        replyText: 'もちろん届いてるよ！準備は万端？リスナーのみんなと一緒に盛り上がっていこ！',
        displaySubtitle: 'もちろん届いてるよ！準備は万端？リスナーのみんなと一緒に盛り上がっていこー！🌸',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 3. Victory, Clutch, Good play (Expand conversation with dynamic questions)
  if (
    text.includes('ナイス') ||
    text.includes('勝った') ||
    text.includes('やった') ||
    text.includes('倒した') ||
    text.includes('クリア') ||
    text.includes('神プレイ') ||
    text.includes('うまい') ||
    text.includes('成功') ||
    text.includes('討伐') ||
    text.includes('決めた')
  ) {
    const list: LocalReply[] = [
      {
        replyText: `うおおお！やったあああ！最後の一撃、完全にプロゲーマーの動きだったじゃん！ドロップ品何かいいの出た？`,
        displaySubtitle: `うおおお！やったあああ！最後の一撃、完全にプロゲーマーの動きだったじゃん！🏆✨ 何かいいドロップあった！？`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: `ナイスプレーーーイ！今のカウンター決まった瞬間、鳥肌立っちゃったよ！この調子で次もいっちゃう？`,
        displaySubtitle: `ナイスプレーーーイ！！今のカウンター決まった瞬間、鳥肌立っちゃったよ！👏🔥 この調子で次もいく！？`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: `完全勝利お見事！あそこから逆転するの流石相棒だわ！リスナーのみんなもチャット欄で拍手喝采だよ！`,
        displaySubtitle: `完全勝利お見事！あそこから逆転するの流石相棒だわ！リスナーも拍手喝采だよ！🙌✨`,
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: `勝った勝ったー！危ない場面もあったけど、最後きっちり仕留める集中力が凄すぎた！装備強化できそう？`,
        displaySubtitle: `勝った勝ったー！危ない場面もあったけど、最後きっちり仕留めたね！武器の強化できそう？⚔️`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: `ふふん、私の応援のおかげもあるかもね！でも今の立ち回りは百点満点！ナイスファイト！`,
        displaySubtitle: `ふふん、私の応援のおかげもあるかもね！😏 でも今の立ち回りは百点満点！ナイスファイト！✨`,
        emotion: 'smug',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 4. Fail, Blunder, Death, Tsukkomi moments (Ad-lib tsukkomi & tease)
  if (
    text.includes('やらかした') ||
    text.includes('死んだ') ||
    text.includes('落ちた') ||
    text.includes('ミス') ||
    text.includes('乙') ||
    text.includes('痛い') ||
    text.includes('全滅') ||
    text.includes('負けた') ||
    text.includes('溶けた') ||
    text.includes('やらかし') ||
    text.includes('やっちまった')
  ) {
    const list: LocalReply[] = [
      {
        replyText: 'ちょっ、何やってんのー！？そこで落ちるのは完全に配信の見せ場作りにきてるでしょ！大爆笑しちゃったよ！',
        displaySubtitle: 'ちょっ、何やってんのー！？ｗ そこで落ちるのは完全に配信の見せ場作りでしょ！🤣💦',
        emotion: 'tsukkomi',
        tsukkomiScore: 4,
      },
      {
        replyText: 'おいおいおい！いまのはツッコまずにはいられないよ！完全に欲張って突っ込んだでしょ！リベンジいこ！',
        displaySubtitle: 'おいおいおい！いまのはツッコまずにはいられないよ！完全に欲張って突っ込んだでしょｗｗ🤣⚡',
        emotion: 'tsukkomi',
        tsukkomiScore: 5,
      },
      {
        replyText: 'あちゃー！派手にやらかしたね！でもあのミスは芸術点高すぎて許しちゃう！次はどこからやり直す？',
        displaySubtitle: 'あちゃー！派手にやらかしたね！でもあのミスは芸術点高すぎて許しちゃうｗ 次どこからやり直す？🔥',
        emotion: 'laugh',
        tsukkomiScore: 3,
      },
      {
        replyText: 'うっそでしょ！？今のはトラップが見え見えだったじゃん！もう、相棒のこういうお茶目なとこ大好きだけどね！',
        displaySubtitle: 'うっそでしょ！？ｗ 今のはトラップ見え見えだったじゃん！もう、そういうとこ大好きだけどね！😆',
        emotion: 'tsukkomi',
        tsukkomiScore: 4,
      },
      {
        replyText: 'どんまいどんまい！今のデスは敵の当たり判定が理不尽だったってことにしとこ！仕切り直して突撃だー！',
        displaySubtitle: 'どんまいどんまい！今のデスは敵の判定が理不尽だったってことにしとこ！仕切り直して突撃だー！👊',
        emotion: 'happy',
        tsukkomiScore: 2,
      },
    ];
    return pickUnique(list);
  }

  // 5. Crisis, Danger, Panic (Urgent & playful teasing)
  if (
    text.includes('ピンチ') ||
    text.includes('助けて') ||
    text.includes('やばい') ||
    text.includes('死にそう') ||
    text.includes('囲まれた') ||
    text.includes('回復') ||
    text.includes('逃げろ') ||
    text.includes('あぶない') ||
    text.includes('きつい')
  ) {
    const list: LocalReply[] = [
      {
        replyText: 'うわわっ！エイチピーミリじゃん！一回離れて！落ち着いて回復薬飲んでー！',
        displaySubtitle: 'うわわっ！HPミリじゃん！一回離れて！落ち着いて回復薬飲んでー！😱💦',
        emotion: 'worry',
        tsukkomiScore: 2,
      },
      {
        replyText: '絶体絶命の大ピンチ！避けて避けて！ここ耐えきったら絶対勝ち筋あるから諦めないで！',
        displaySubtitle: '絶体絶命の大ピンチ！避けて避けて！ここ耐えたら勝ち筋あるよ、諦めないで！🔥',
        emotion: 'worry',
        tsukkomiScore: 2,
      },
      {
        replyText: 'ぎゃあ！後ろから迫ってきてるよ！全力でローリングステップ踏んで逃げ道作って！',
        displaySubtitle: 'ぎゃあ！後ろから迫ってきてるよ！全力でステップ踏んで逃げ道作って！💨',
        emotion: 'surprise',
        tsukkomiScore: 2,
      },
      {
        replyText: 'ひええ、見てるこっちまで心臓バクバクする！敵の隙ができるまでガードで耐えよ！',
        displaySubtitle: 'ひええ、見てるこっちまで心臓バクバクする！盾構えてガードで耐えてー！🥶',
        emotion: 'worry',
        tsukkomiScore: 2,
      },
    ];
    return pickUnique(list);
  }

  // 6. Boss Battle / Giant Enemy (Hyped co-host energy)
  if (
    text.includes('ボス') ||
    text.includes('始まった') ||
    text.includes('強敵') ||
    text.includes('デカい') ||
    text.includes('ラスボス') ||
    text.includes('開幕') ||
    text.includes('対戦')
  ) {
    const list: LocalReply[] = [
      {
        replyText: 'ボス戦キター！BGMも熱くなってきたし、弱点狙って初手から一気にぶちかましちゃえ！',
        displaySubtitle: 'ボス戦キター！！BGMも熱くなってきたし、弱点狙って一気にぶちかましちゃえ！⚔️🔥',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: 'うわ、めっちゃ強そうなの出てきた！焦らずモーション見極めていこう！私の応援パワー全部送るね！',
        displaySubtitle: 'うわ、めっちゃ強そうなの出てきた！焦らずモーション見極めていこう！応援パワー全部送るね！✨',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: 'ラスボス級の迫力じゃん！初見で緊張するけど、相棒なら絶対いける！落ち着いていこー！',
        displaySubtitle: 'ラスボス級の迫力じゃん！初見で緊張するけど、相棒なら絶対いける！いっけー！🌟',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 7. Gacha / Luck / Rolls
  if (
    text.includes('ガチャ') ||
    text.includes('引く') ||
    text.includes('回す') ||
    text.includes('神引き') ||
    text.includes('当たれ') ||
    text.includes('最高レア') ||
    text.includes('運試し')
  ) {
    const list: LocalReply[] = [
      {
        replyText: '頼む神引き！金色に光れー！私の全運気、今相棒に送ったからね！',
        displaySubtitle: '頼む神引きーー！金色に光れぇぇ！私の全運気、今相棒に送ったからね！🎰✨',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: '緊張の一瞬…！最高レアこいこいこい！画面タップする指に祈り込めといたよ！',
        displaySubtitle: '緊張の一瞬…！最高レアこいこいこい！画面タップに祈り込めといたよ！🌟',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'いけえええ！虹色確定演出きてー！どうだった！？結果教えて！',
        displaySubtitle: 'いけえええ！虹色確定演出来てー！結果どうだった！？👀',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 8. Horror / Scream
  if (
    text.includes('怖い') ||
    text.includes('ホラー') ||
    text.includes('叫') ||
    text.includes('ギャー') ||
    text.includes('ビビ') ||
    text.includes('不気味') ||
    text.includes('驚')
  ) {
    const list: LocalReply[] = [
      {
        replyText: 'ぎゃあああああ！急に画面に出てくるの反則でしょ！心臓止まるかと思ったよぉ！',
        displaySubtitle: 'ぎゃあああああ！！急に画面に出てくるの反則でしょ！心臓止まるかと思ったよぉ！👻💦',
        emotion: 'surprise',
        tsukkomiScore: 3,
      },
      {
        replyText: 'うう…雰囲気怖すぎるよ…！相棒、前進むの勇気ありすぎ！後ろからしっかり見守ってるからね！',
        displaySubtitle: 'うう…雰囲気怖すぎるよ…！相棒、前進むの勇気ありすぎ！後ろからしっかり見守ってるね…！🥶',
        emotion: 'worry',
        tsukkomiScore: 2,
      },
      {
        replyText: 'ちょっと待って、いまの音何！？絶対近くに何かいるって！早く明るい場所に逃げよ！',
        displaySubtitle: 'ちょっと待って、いまの音何！？絶対近くに何かいるって！早く逃げてー！😱',
        emotion: 'surprise',
        tsukkomiScore: 3,
      },
    ];
    return pickUnique(list);
  }

  // 9. Tsukkomi / Boke specific request
  if (text.includes('ツッコミ') || text.includes('つっこ') || text.includes('ボケ')) {
    const list: LocalReply[] = [
      {
        replyText: 'ツッコミ待ちだったの！？もう、そういうとこホント相棒らしいんだから！ツッコんであげたから満足した？',
        displaySubtitle: 'ツッコミ待ちだったの！？ｗ もう、そういうとこホント相棒らしいんだから！満足した！？🤣⚡',
        emotion: 'tsukkomi',
        tsukkomiScore: 4,
      },
      {
        replyText: 'いやいやいや！その行動は誰がどう見てもボケでしょ！全力でツッコませてもらいましたー！',
        displaySubtitle: 'いやいやいや！その行動は誰がどう見てもボケでしょ！全力でツッコませていただきました！ｗ🤣',
        emotion: 'tsukkomi',
        tsukkomiScore: 5,
      },
    ];
    return pickUnique(list);
  }

  // 10. Topic switch / Casual Chat / Rest / Water break
  if (
    text.includes('雑談') ||
    text.includes('休憩') ||
    text.includes('水') ||
    text.includes('一息') ||
    text.includes('ゲームの話は') ||
    text.includes('別の話') ||
    text.includes('別のこと') ||
    text.includes('その話はやめ') ||
    text.includes('その話はいい') ||
    text.includes('話変え') ||
    text.includes('世間話') ||
    text.includes('普通の会話')
  ) {
    const list: LocalReply[] = [
      {
        replyText: 'いいよ、雑談しよっか！何の話しようか？クマ様が今気になってること何でも教えて！',
        displaySubtitle: 'いいよ、雑談しよっか！何の話しようか？気になってること何でも教えてクマ様！🌸💬',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: '了解！ゲームは一旦置いといて、ゆっくり話そ！最近面白いことあった、クマ様？',
        displaySubtitle: '了解！ゲームは一旦置いといてゆっくり話そ！最近面白いことあったクマ様？✨',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'ふぅ、ちょっと一息つこっか！水分補給しっかりしてねクマ様！リスナーのみんなもゆっくりしていってね！',
        displaySubtitle: 'ふぅ、ちょっと一息つこっか！水分補給しっかりしてねクマ様！☕🌸',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'オッケー、のんびり雑談タイムだね！クマ様とこうやっておしゃべりする時間、てってなも大好きだよ！',
        displaySubtitle: 'オッケー、のんびり雑談タイムだね！クマ様とおしゃべりするのも大好き！💬🥰',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 11. Pets: Dog / Cat / Animals
  if (
    text.includes('犬') ||
    text.includes('猫') ||
    text.includes('わん') ||
    text.includes('にゃん') ||
    text.includes('ペット') ||
    text.includes('柴犬') ||
    text.includes('散歩') ||
    text.includes('動物')
  ) {
    const list: LocalReply[] = [
      {
        replyText: userSnippet
          ? `「${userSnippet}」か〜！動物の話って本当に癒やされるよね！クマ様、もっと教えて！`
          : 'わぁ、ワンちゃんや猫ちゃんの話！？てってなも動物大好きだからテンション上がっちゃう！クマ様、もっと教えて！',
        displaySubtitle: userSnippet
          ? `「${userSnippet}」か〜！動物の話って本当に癒やされるよね！クマ様、もっと教えて！🐶🐱`
          : 'わぁ、ワンちゃんや猫ちゃんの話！？てってなも動物大好き！クマ様、もっと教えて！🐾✨',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: 'えへへ、可愛い〜！想像しただけでふわふわして癒やされちゃうね！クマ様のそういう優しいところ好きだな〜！',
        displaySubtitle: 'えへへ、可愛い〜！想像しただけで癒やされる！クマ様の優しいところ好きだな〜！🌸🥰',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 12. Motorcycle / Touring / Drive
  if (
    text.includes('バイク') ||
    text.includes('ツーリング') ||
    text.includes('単車') ||
    text.includes('ヘルメット') ||
    text.includes('原付') ||
    text.includes('ドライブ') ||
    text.includes('走')
  ) {
    const list: LocalReply[] = [
      {
        replyText: userSnippet
          ? `「${userSnippet}」だね！バイクで風を感じるの、めちゃくちゃかっこいいよクマ様！今度どこ行くの？`
          : 'バイクの話だ！風を感じて走るの、想像するだけで爽快だよね！クマ様の愛車かっこいいんだろうな〜！',
        displaySubtitle: userSnippet
          ? `「${userSnippet}」だね！バイクで風を感じるの、めちゃかっこいいよクマ様！🏍️💨`
          : 'バイクの話だ！風を感じて走るの爽快だよね！クマ様の愛車かっこいいんだろうな〜！🏍️✨',
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: 'ツーリングいいなぁ！気候がいい日のライディングって最高でしょ！安全運転で楽しんできてね、クマ様！',
        displaySubtitle: 'ツーリングいいなぁ！気候がいい日のライディングって最高！安全運転でねクマ様！🛵💨',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 13. Daily Life / Food / Work / Rest
  if (
    text.includes('ご飯') ||
    text.includes('飯') ||
    text.includes('ラーメン') ||
    text.includes('お腹') ||
    text.includes('食べ') ||
    text.includes('仕事') ||
    text.includes('疲れ') ||
    text.includes('眠い')
  ) {
    const list: LocalReply[] = [
      {
        replyText: userSnippet
          ? `「${userSnippet}」か〜！クマ様、今日もお疲れ様！美味しいもの食べてしっかり英気養ってね！`
          : 'クマ様、今日もお疲れ様！美味しいもの食べてゆっくりリラックスしてね！てってなも応援してるよ！',
        displaySubtitle: userSnippet
          ? `「${userSnippet}」か〜！クマ様、今日もお疲れ様！美味しいもの食べてね！🍵✨`
          : 'クマ様、今日もお疲れ様！美味しいもの食べてゆっくりリラックスしてね！🍱🌸',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'ご飯の話聞いたらてってなまでお腹空いてきちゃった！飯テロだ〜！クマ様は何食べる予定？',
        displaySubtitle: 'ご飯の話聞いたらてってなまでお腹空いてきちゃった！飯テロだ〜！何食べるのクマ様？🍜😋',
        emotion: 'laugh',
        tsukkomiScore: 2,
      },
    ];
    return pickUnique(list);
  }

  // 14. Advice / Question
  if (text.includes('どう') || text.includes('どっち') || text.includes('迷う') || text.includes('合ってる')) {
    const list: LocalReply[] = [
      {
        replyText: 'ここは直感を信じるべし！迷ったら面白い方に突っ込んじゃうのがクマ様スタイルでしょ！',
        displaySubtitle: 'ここは直感を信じるべし！迷ったら面白い方に突っ込んじゃうのがクマ様スタイルでしょ！😏🔥',
        emotion: 'smug',
        tsukkomiScore: 2,
      },
      {
        replyText: 'てってなら果敢に攻めちゃうけど、クマ様はどうしたい？どっち選んでも全力でついていくよ！',
        displaySubtitle: 'てってなら果敢に攻めちゃうけど、クマ様はどうしたい？どっち選んでも全力でついていくよ！✨',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 15. General adaptive banter (incorporates user snippet & tone style)
  if (toneStyle === 'tsukkomi') {
    const list: LocalReply[] = [
      {
        replyText: userSnippet
          ? `「${userSnippet}」って、それ完全にフラグ立ててないクマ様？でもそのノリ大好きだから見守っちゃう！`
          : 'ふふっ、そのノリ最高！クマ様が楽しそうだと配信もめちゃくちゃ盛り上がるね！次何やる？',
        displaySubtitle: userSnippet
          ? `「${userSnippet}」って、それ完全にフラグ立ててないクマ様！？ｗ でもそのノリ大好き！🤣`
          : 'ふふっ、そのノリ最高！クマ様が楽しそうだと配信もめちゃくちゃ盛り上がるね！😆⚡',
        emotion: 'tsukkomi',
        tsukkomiScore: 3,
      },
      {
        replyText: 'おいおい、今の展開なかなか攻めてるねクマ様！どう転んでも美味しい見せ場になりそう！',
        displaySubtitle: 'おいおい、今の展開なかなか攻めてるねクマ様！どう転んでも美味しい見せ場になりそう！⚡',
        emotion: 'tsukkomi',
        tsukkomiScore: 3,
      },
      {
        replyText: 'ちょっとちょっと、よそうがいの動きするじゃんクマ様！そういう自由なプレイ見ててワクワクするよ！',
        displaySubtitle: 'ちょっとちょっと、予想外の動きするじゃんクマ様！そういう自由なプレイ見ててワクワクするよ！😆✨',
        emotion: 'laugh',
        tsukkomiScore: 3,
      },
    ];
    return pickUnique(list);
  }

  if (toneStyle === 'energetic') {
    const list: LocalReply[] = [
      {
        replyText: `いいねいいね！その調子でどんどん突き進んじゃおう！クマ様の勢い、見ててスカッとするよ！`,
        displaySubtitle: `いいねいいね！その調子でどんどん突き進んじゃおう！クマ様の勢い、見ててスカッとする！🔥✨`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: `ハイテンションでいこー！この勢いならクマ様、どんな場面も一気に突破できちゃいそう！`,
        displaySubtitle: `ハイテンションでいこー！この勢いならクマ様、どんな場面も一気に突破できちゃいそう！🎉`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  if (toneStyle === 'sassy') {
    const list: LocalReply[] = [
      {
        replyText: 'ふふん、クマ様の実力はそんなもんじゃないでしょ？もっとリスナーを湧かせる神プレイ見せてみなさい！',
        displaySubtitle: 'ふふん、クマ様の実力はそんなもんじゃないでしょ？もっとリスナーを湧かせてみなさい！😏✨',
        emotion: 'smug',
        tsukkomiScore: 2,
      },
      {
        replyText: 'へえ、なかなか面白いルート選ぶじゃんクマ様！腕の見せ所だよ、期待して見ててあげる！',
        displaySubtitle: 'へえ、なかなか面白いルート選ぶじゃんクマ様！腕の見せ所だよ、期待して見ててあげる！👀✨',
        emotion: 'smug',
        tsukkomiScore: 2,
      },
    ];
    return pickUnique(list);
  }

  // Default friendly companion banter
  const defaultList: LocalReply[] = [
    {
      replyText: userSnippet
        ? `「${userSnippet}」だね！うんうん、クマ様の話ちゃんと聞いてるよ！てってなも気になるな〜！`
        : 'うんうん、クマ様の話ちゃんと聞いてるよ！てってなも気になるな〜！',
      displaySubtitle: userSnippet
        ? `「${userSnippet}」だね！うんうん、クマ様の話ちゃんと聞いてるよ！💬✨`
        : 'うんうん、クマ様の話ちゃんと聞いてるよ！💬✨',
      emotion: 'happy',
      tsukkomiScore: 1,
    },
    {
      replyText: userSnippet
        ? `なるほど！「${userSnippet}」って話、クマ様らしくて面白い！てってなもっと聞きたいかも！`
        : 'なるほどね、そうきたか！クマ様のそういう発想、いつも面白くて感心しちゃうよ！',
      displaySubtitle: userSnippet
        ? `なるほど！「${userSnippet}」って話、クマ様らしくて面白い！もっと聞きたい！🌸`
        : 'なるほどね、そうきたか！クマ様のそういう発想、いつも面白くて感心しちゃう！✨',
      emotion: 'excited',
      tsukkomiScore: 1,
    },
    {
      replyText: userSnippet
        ? `クマ様、「${userSnippet}」か〜！それいいじゃん！てってなもワクワクしてきた！`
        : 'クマ様、いい感じの流れになってきたね！リスナーのみんなも盛り上がってるよ！',
      displaySubtitle: userSnippet
        ? `クマ様、「${userSnippet}」か〜！それいいじゃん！ワクワクしてきた！🎉`
        : 'クマ様、いい感じの流れになってきたね！リスナーのみんなも盛り上がってるよ！🎉',
      emotion: 'happy',
      tsukkomiScore: 1,
    },
    {
      replyText: 'ふふっ、クマ様とこうやってお話しできる時間、てってなもすごく楽しいよ！何でも話してね！',
      displaySubtitle: 'ふふっ、クマ様とこうやってお話しできる時間、てってなもすごく楽しい！何でも話してね！🥰',
      emotion: 'happy',
      tsukkomiScore: 1,
    },
  ];
  return pickUnique(defaultList);
}

// API: Health / status
app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/api/status', (_req: Request, res: Response) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY);
  const now = Date.now();
  res.json({
    status: 'ok',
    hasApiKey: hasKey,
    companion: 'てってなちゃん',
    ttsVoice: 'Kore (Gemini TTS)',
    ttsQuotaExhausted: now < ttsQuotaExhaustedUntil,
    chatQuotaExhausted: now < chat38QuotaExhaustedUntil && now < chat31QuotaExhaustedUntil,
  });
});

function sanitizeAivisTarget(rawTarget?: string): string {
  let trimmed = (rawTarget || '').trim().replace(/\/$/, '');
  if (!trimmed) return 'http://127.0.0.1:10101';
  // Strip trailing /speakers or /api/aivis if mistakenly passed in target
  trimmed = trimmed.replace(/\/speakers\/?$/i, '').replace(/\/api\/aivis\/?$/i, '');
  if (!trimmed) return 'http://127.0.0.1:10101';
  // If target points to this web app (e.g. localhost:3000) or contains api paths, sanitize to default local engine
  if (
    trimmed.includes(':3000') ||
    trimmed.includes('/api/aivis') ||
    trimmed.includes('/speakers') ||
    trimmed.startsWith('/') ||
    trimmed === 'http://localhost' ||
    trimmed === 'http://127.0.0.1'
  ) {
    return 'http://127.0.0.1:10101';
  }
  return trimmed;
}

// AivisSpeech Local Proxy: Proxies requests to local AivisSpeech Engine (127.0.0.1:10101)
// Completely resolves browser CORS, Private Network Access (PNA), and Mixed Content blocks.
const handleAivisSpeakersProxy = async (req: Request, res: Response) => {
  const target = sanitizeAivisTarget(req.query.target as string);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const aivisUrl = `${target}/speakers`;
    const response = await fetch(aivisUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      res.status(response.status).json({ error: `AivisSpeech error (${response.status}): ${errText}` });
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    const isConnRefused = err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || err?.message?.includes('fetch failed');
    res.status(502).json({
      error: isConnRefused
        ? 'AivisSpeech Engine (http://127.0.0.1:10101) が停止しているか接続できません。AivisSpeechを起動してください。'
        : `AivisSpeech接続エラー: ${err?.message || err}`,
      code: isConnRefused ? 'ECONNREFUSED' : 'FETCH_ERROR',
    });
  }
};

// Route both /api/aivis/speakers and /speakers (all variants) directly to proxy handler so 404 is impossible
app.all(
  ['/api/aivis/speakers', '/api/aivis/speakers/', '/speakers', '/speakers/'],
  handleAivisSpeakersProxy
);

// Proxy for AivisSpeech audio_query (handles query params text & speaker, plus target)
app.all(
  ['/api/aivis/audio_query', '/api/aivis/audio_query/', '/audio_query', '/audio_query/'],
  async (req: Request, res: Response) => {
    const rawText = (req.query.text as string) || (req.body?.text as string) || '';
    const speaker = req.query.speaker || req.body?.speaker || 1935723904;
    const target = (req.query.target as string) || req.body?.target;
    const cleanBase = sanitizeAivisTarget(target);
    const cleanText = rawText.replace(/[\(（][^）\)]*[\)）]/g, '').replace(/[ｗwW草]/g, '').trim();

    if (!cleanText) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const queryUrl = `${cleanBase}/audio_query?text=${encodeURIComponent(cleanText)}&speaker=${speaker}`;
      const queryRes = await fetch(queryUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!queryRes.ok) {
        const errText = await queryRes.text().catch(() => '');
        res.status(queryRes.status).json({ error: `audio_query failed (${queryRes.status}): ${errText}` });
        return;
      }
      const data = await queryRes.json();
      res.json(data);
    } catch (err: any) {
      const isConnRefused = err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || err?.message?.includes('fetch failed');
      res.status(502).json({
        error: isConnRefused
          ? 'AivisSpeech Engine (http://127.0.0.1:10101) が停止しているか接続できません。'
          : `audio_query error: ${err?.message || err}`,
        code: isConnRefused ? 'ECONNREFUSED' : 'AUDIO_QUERY_ERROR',
      });
    }
  }
);

// Proxy for AivisSpeech synthesis (takes queryData JSON body and returns audio/wav binary)
app.all(
  ['/api/aivis/synthesis', '/api/aivis/synthesis/', '/synthesis', '/synthesis/'],
  async (req: Request, res: Response) => {
    const speaker = req.query.speaker || req.body?.speaker || 1935723904;
    const target = (req.query.target as string) || req.body?.target;
    const cleanBase = sanitizeAivisTarget(target);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const synthUrl = `${cleanBase}/synthesis?speaker=${speaker}`;
      const synthRes = await fetch(synthUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!synthRes.ok) {
        const errText = await synthRes.text().catch(() => '');
        res.status(synthRes.status).json({ error: `synthesis failed (${synthRes.status}): ${errText}` });
        return;
      }

      res.setHeader('Content-Type', 'audio/wav');
      const arrayBuffer = await synthRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      const isConnRefused = err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || err?.message?.includes('fetch failed');
      res.status(502).json({
        error: isConnRefused
          ? 'AivisSpeech Engine (http://127.0.0.1:10101) が停止しているか接続できません。'
          : `synthesis error: ${err?.message || err}`,
        code: isConnRefused ? 'ECONNREFUSED' : 'SYNTHESIS_ERROR',
      });
    }
  }
);

app.post('/api/aivis/synthesize', async (req: Request, res: Response) => {
  const { text, speaker = 1935723904, target } = req.body;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ success: false, error: 'Text is required' });
    return;
  }
  const cleanBase = sanitizeAivisTarget(target);
  const cleanText = text.replace(/[\(（][^）\)]*[\)）]/g, '').replace(/[ｗwW草]/g, '').trim();

  try {
    // Step 1: audio_query
    const queryController = new AbortController();
    const queryTimeout = setTimeout(() => queryController.abort(), 4000);
    const queryRes = await fetch(`${cleanBase}/audio_query?text=${encodeURIComponent(cleanText)}&speaker=${speaker}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: queryController.signal,
    });
    clearTimeout(queryTimeout);

    if (!queryRes.ok) {
      const errText = await queryRes.text().catch(() => '');
      res.status(queryRes.status).json({ success: false, error: `audio_query failed (${queryRes.status}): ${errText}` });
      return;
    }
    const queryData = await queryRes.json();

    // Step 2: synthesis
    const synthController = new AbortController();
    const synthTimeout = setTimeout(() => synthController.abort(), 12000);
    const synthRes = await fetch(`${cleanBase}/synthesis?speaker=${speaker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify(queryData),
      signal: synthController.signal,
    });
    clearTimeout(synthTimeout);

    if (!synthRes.ok) {
      const errText = await synthRes.text().catch(() => '');
      res.status(synthRes.status).json({ success: false, error: `synthesis failed (${synthRes.status}): ${errText}` });
      return;
    }

    const arrayBuffer = await synthRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const audioBase64 = buffer.toString('base64');
    res.json({ success: true, audioBase64 });
  } catch (err: any) {
    const isConnRefused = err?.code === 'ECONNREFUSED' || err?.message?.includes('ECONNREFUSED') || err?.message?.includes('fetch failed');
    res.status(502).json({
      success: false,
      error: isConnRefused
        ? 'AivisSpeech Engine (http://127.0.0.1:10101) が停止しているか接続できません。AivisSpeechを起動してください。'
        : `AivisSpeech合成エラー: ${err?.message || err}`,
      code: isConnRefused ? 'ECONNREFUSED' : 'SYNTHESIS_ERROR',
    });
  }
});

/**
 * 音声読み上げ用テキストの読み間違い補正関数
 * 画面字幕(displaySubtitle)の漢字表記は維持したまま、音声用(replyText)のみ
 * 文脈や単語によって誤読が生じやすい表現（例：「話そうか」→「はなそうか」、「回復薬」→「かいふくやく」）を自然なひらがなに補正する
 */
function normalizeReplyTextForSpeech(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;

  // 1. 既知の誤読しやすい名詞・複合語・ゲーム用語
  const wordReplacements: [RegExp, string][] = [
    [/回復薬グレート/g, 'かいふくやくグレート'],
    [/回復薬/g, 'かいふくやく'],
    [/想定外/g, 'そうていがい'],
    [/操虫棍/g, 'そうちゅうこん'],
    [/狩猟笛/g, 'しゅりょうぶえ'],
    [/大剣/g, 'たいけん'],
    [/太刀/g, 'たち'],
    [/双剣/g, 'そうけん'],
    [/落とし穴/g, 'おとしあな'],
    [/シビレ罠/g, 'シビレわな'],
    [/捕獲用麻酔玉/g, 'ほかくようますいだま'],
    [/3乙|３乙/g, 'さんおつ'],
    [/1乙|１乙/g, 'いちおつ'],
    [/2乙|２乙/g, 'におつ'],
  ];

  for (const [pattern, replacement] of wordReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  // 2. 文脈によって形態素解析が崩れやすい動詞の意向形・活用・文末表現
  // （「話そうか」が「はなしそくあ」等に誤読される問題の対策）
  normalized = normalized
    .replace(/話そうか/g, 'はなそうか')
    .replace(/話そうよ/g, 'はなそうよ')
    .replace(/話そうね/g, 'はなそうね')
    .replace(/話そう/g, 'はなそう')
    .replace(/話し合おう/g, 'はなしあおう')
    .replace(/お話ししよう/g, 'おはなししよう')
    .replace(/お話し/g, 'おはなし')
    // その他、文脈で音読みや誤読が起きやすい動詞の意向形
    .replace(/行こうか/g, 'いこうか')
    .replace(/行こうよ/g, 'いこうよ')
    .replace(/行こうね/g, 'いこうね')
    .replace(/行こう/g, 'いこう')
    .replace(/見ようか/g, 'みようか')
    .replace(/見よう/g, 'みよう')
    .replace(/遊ぼうか/g, 'あそぼうか')
    .replace(/遊ぼう/g, 'あそぼう')
    .replace(/言おうか/g, 'いおうか')
    .replace(/言おう/g, 'いおう')
    .replace(/聞こうか/g, 'きこうか')
    .replace(/聞こう/g, 'きこう')
    .replace(/倒そうか/g, 'たおそうか')
    .replace(/倒そう/g, 'たおそう')
    .replace(/勝とう/g, 'かとう')
    .replace(/食べようか/g, 'たべようか')
    .replace(/食べよう/g, 'たべよう');

  return normalized;
}

// Helper: Try generating content with a specific model with active timeout and request cancellation
async function callGeminiChat(
  ai: GoogleGenAI,
  modelName: string,
  systemInstruction: string,
  formattedHistory: any[],
  message: string,
  timeoutMs: number = 3500
) {
  const contents = [
    ...formattedHistory,
    {
      role: 'user',
      parts: [{ text: `【配信者（クマ様）の発言】: 「${message}」` }],
    },
  ];

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error(`Gemini API (${modelName}) timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const isFlashLite = modelName.includes('flash-lite');

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        abortSignal: abortController.signal,
        httpOptions: {
          timeout: 10000, // Meets Google API minimum deadline requirement
          retryOptions: {
            attempts: 1, // 1 = only original request attempt, no SDK retry delays
          },
        },
        systemInstruction,
        thinkingConfig: {
          thinkingLevel: isFlashLite ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            replyText: {
              type: Type.STRING,
              description:
                'TTS音声読み上げ用のセリフ（2〜3文目安、記号や草なし。文章の流れで読み間違いが起きやすい表現は、必ず自然なひらがな表記で出力すること。例：「話そうか」→「はなそうか」、「話そう」→「はなそう」、「回復薬」→「かいふくやく」、「想定外」→「そうていがい」など。文脈による誤読を避けるため、動詞の意向形や誤読されやすい複合語は平易なひらがなで出力すること）',
            },
            displaySubtitle: {
              type: Type.STRING,
              description:
                '画面字幕用の見やすいテキスト（通常の自然な漢字表記を維持し、「話そうか」「回復薬」「想定外」などの漢字表記や感嘆符・（笑）を含める）',
            },
            emotion: {
              type: Type.STRING,
              description: '感情タグ (happy, excited, tsukkomi, laugh, surprise, worry, smug, neutral)',
            },
            tsukkomiScore: {
              type: Type.INTEGER,
              description: 'ツッコミ度 (1-5)',
            },
          },
          required: ['replyText', 'displaySubtitle', 'emotion'],
        },
      },
    });

    clearTimeout(timeoutId);
    return JSON.parse(response.text || '{}');
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// API: One-shot combined talk endpoint for lowest live latency & rock-solid resilience
app.post('/api/talk', async (req: Request, res: Response) => {
  try {
    const { message, history, gameTitle, currentSituation, toneStyle, voiceName, skipServerTTS, memories } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const ai = getAiClient();
    const memoryList = Array.isArray(memories) ? memories.filter((m: any) => typeof m === 'string' && m.trim().length > 0) : [];
    const systemInstruction = buildSystemInstruction(gameTitle, currentSituation, toneStyle, memoryList);
    const formattedHistory = Array.isArray(history)
      ? history.slice(-8).map((h: { role: string; text: string }) => ({
          role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.role === 'assistant' || h.role === 'model' ? h.text : `クマ様: ${h.text}` }],
        }))
      : [];

    let parsedReply: any = null;
    let isOfflineFallback = false;
    let quotaExceeded = false;
    let activeEngine: 'GEMINI' | 'LOCAL_FALLBACK' = 'GEMINI';
    let modelUsed = '';
    let errorType: 'NONE' | 'MISSING_API_KEY' | 'QUOTA_429' | 'API_ERROR' = 'NONE';
    let errorMessage: string | null = null;
    const now = Date.now();

    // 1. Text Generation with multi-tiered resilience (3.1-flash-lite -> 3.8-flash -> Local Engine)
    if (ai) {
      // Tier 1: Gemini 3.1 Flash Lite (Primary high-speed model with 3500ms timeout)
      if (now >= chat31QuotaExhaustedUntil) {
        try {
          parsedReply = await callGeminiChat(
            ai,
            'gemini-3.1-flash-lite',
            systemInstruction,
            formattedHistory,
            message,
            3500
          );
          modelUsed = 'gemini-3.1-flash-lite';
        } catch (err: any) {
          const errStr = String(err?.message || err);
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
            console.warn('Gemini 3.1 Flash Lite quota reached 429. Setting 25s backoff.');
            chat31QuotaExhaustedUntil = Date.now() + 25 * 1000; // 25s backoff
            quotaExceeded = true;
            errorType = 'QUOTA_429';
            errorMessage = 'Gemini API レート制限 (429)。25秒後に自動再開します。';
          } else if (errStr.includes('503') || errStr.includes('UNAVAILABLE') || errStr.includes('timed out') || errStr.includes('aborted')) {
            console.warn(`Gemini 3.1 応答遅延・混雑(${err.message})。Tier 2へ即座に移行します。`);
            errorType = 'API_ERROR';
            errorMessage = 'Gemini 3.1 応答遅延/503。Tier 2へ即時切り替え。';
          } else {
            console.warn('Gemini 3.1 Flash Lite error:', err.message);
            errorType = 'API_ERROR';
            errorMessage = err.message || 'Gemini 3.1 呼び出しエラー';
          }
        }
      } else {
        errorType = 'QUOTA_429';
        errorMessage = 'Gemini 3.1 クールダウン待機中';
      }

      // Tier 2: Gemini 3.8 Flash fallback (3000ms timeout)
      if (!parsedReply && now >= chat38QuotaExhaustedUntil) {
        try {
          parsedReply = await callGeminiChat(
            ai,
            'gemini-3.8-flash',
            systemInstruction,
            formattedHistory,
            message,
            3000
          );
          modelUsed = 'gemini-3.8-flash';
          errorType = 'NONE';
          errorMessage = null;
        } catch (err: any) {
          const errStr = String(err?.message || err);
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
            console.warn('Gemini 3.8 Flash quota reached 429. Setting 25s backoff.');
            chat38QuotaExhaustedUntil = Date.now() + 25 * 1000;
            quotaExceeded = true;
            errorType = 'QUOTA_429';
            errorMessage = 'Gemini API レート制限 (429)。25秒後に自動再開します。';
          } else {
            console.warn('Gemini 3.8 Flash error / timeout:', err.message);
            if (errorType !== 'QUOTA_429') {
              errorType = 'API_ERROR';
              errorMessage = err.message || 'Gemini 3.8 呼び出しエラー/タイムアウト';
            }
          }
        }
      }
    } else {
      errorType = 'MISSING_API_KEY';
      errorMessage = 'GEMINI_API_KEY が設定されていません。ローカル応答エンジンで稼働中。';
    }

    // Tier 3: Intelligent Local Tetena Streaming Companion Engine (Zero failure guarantee)
    if (!parsedReply) {
      isOfflineFallback = true;
      activeEngine = 'LOCAL_FALLBACK';
      modelUsed = 'local-tetena-companion-v2';
      parsedReply = generateLocalTetenaReply(message, gameTitle, currentSituation, toneStyle);
    }

    const rawReplyText = parsedReply.replyText || 'クマ様、しっかり見てるよ！頑張って！';
    const displaySubtitle = parsedReply.displaySubtitle || rawReplyText;
    // 音声用 replyText のみ文章全体の読み間違い補正を適用（字幕 displaySubtitle は自然な漢字を維持）
    const replyText = normalizeReplyTextForSpeech(rawReplyText);
    const emotion = parsedReply.emotion || 'happy';
    const tsukkomiScore = parsedReply.tsukkomiScore || 1;

    // Calculate retry delay if in cooldown
    const retryInSeconds = isOfflineFallback
      ? Math.max(0, Math.ceil((Math.min(chat31QuotaExhaustedUntil, chat38QuotaExhaustedUntil) - Date.now()) / 1000))
      : 0;

    const apiStatus = {
      activeEngine,
      modelUsed,
      errorType,
      errorMessage,
      retryInSeconds,
    };

    // 2. Synthesize audio with Gemini TTS or instant browser fallback
    let audioBase64: string | null = null;
    let ttsError: string | null = null;
    let fallbackToBrowserTTS = true;

    // Only attempt Gemini TTS if API key is present AND not currently on 429 cooldown AND server TTS is not skipped
    if (ai && !skipServerTTS && Date.now() >= ttsQuotaExhaustedUntil) {
      const ttsAbortController = new AbortController();
      const ttsTimeoutId = setTimeout(() => {
        ttsAbortController.abort(new Error('Gemini TTS timed out after 3500ms'));
      }, 3500);

      try {
        const selectedVoice = voiceName || 'Kore';
        const style = getStyleForEmotion(emotion);
        const cleanedText = replyText
          .replace(/[\(（][^）\)]*[\)）]/g, '')
          .replace(/[ｗwW草]/g, '')
          .trim();

        const ttsResponse = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: cleanedText || replyText,
                  speechMetadata: {
                    style,
                  },
                },
              ],
            },
          ],
          config: {
            abortSignal: ttsAbortController.signal,
            httpOptions: {
              timeout: 10000, // Meets Google API minimum deadline requirement
              retryOptions: {
                attempts: 1, // No retries for TTS to avoid blocking
              },
            },
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        });

        clearTimeout(ttsTimeoutId);
        audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        if (audioBase64) {
          fallbackToBrowserTTS = false;
        }
      } catch (ttsErr: any) {
        clearTimeout(ttsTimeoutId);
        const ttsErrStr = String(ttsErr?.message || ttsErr);
        if (ttsErrStr.includes('429') || ttsErrStr.includes('RESOURCE_EXHAUSTED')) {
          console.warn('Gemini TTS Free Tier quota reached (429). Setting 25s backoff.');
          ttsQuotaExhaustedUntil = Date.now() + 25 * 1000; // 25s cooldown
          quotaExceeded = true;
        } else {
          console.warn('Gemini TTS synthesis failed, switching to browser speech:', ttsErr.message);
        }
        ttsError = ttsErr.message;
        fallbackToBrowserTTS = true;
      }
    } else {
      // Cooldown active or no key: instantly use browser speech without network delay
      fallbackToBrowserTTS = true;
    }

    res.json({
      replyText,
      displaySubtitle,
      emotion,
      tsukkomiScore,
      audioBase64,
      mimeType: audioBase64 ? 'audio/wav' : null,
      ttsError,
      fallbackToBrowserTTS,
      isOfflineFallback,
      quotaExceeded: quotaExceeded || Date.now() < ttsQuotaExhaustedUntil,
      apiStatus,
    });
  } catch (error: any) {
    // If any unexpected exception occurs, still return a valid Tetena companion reply!
    console.error('Talk top-level handled error:', error);
    const local = generateLocalTetenaReply(req.body?.message || '', req.body?.gameTitle, req.body?.currentSituation, req.body?.toneStyle);
    res.json({
      ...local,
      audioBase64: null,
      mimeType: null,
      fallbackToBrowserTTS: true,
      isOfflineFallback: true,
      quotaExceeded: true,
      apiStatus: {
        activeEngine: 'LOCAL_FALLBACK',
        modelUsed: 'local-tetena-companion-v2',
        errorType: 'API_ERROR',
        errorMessage: error?.message || '予期せぬサーバー例外が発生しました',
        retryInSeconds: 0,
      },
    });
  }
});

// Vite & Static file serving
let port = 3000;
if (process.env.PORT) {
  const p = Number(process.env.PORT);
  if (!isNaN(p) && p > 0) port = p;
}
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--port' && process.argv[i + 1]) {
    const p = Number(process.argv[i + 1]);
    if (!isNaN(p) && p > 0) port = p;
  } else if (arg.startsWith('--port=')) {
    const p = Number(arg.split('=')[1]);
    if (!isNaN(p) && p > 0) port = p;
  }
}

let host = '0.0.0.0';
for (let i = 0; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--host' && process.argv[i + 1]) {
    host = process.argv[i + 1];
  } else if (arg.startsWith('--host=')) {
    host = arg.split('=')[1] || '0.0.0.0';
  }
}

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      root: __dirname,
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(port, host, () => {
    console.log(`てってなちゃん server ready on http://${host}:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is currently in use. Existing process is serving traffic.`);
    } else {
      console.error('Server error:', err);
    }
  });

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

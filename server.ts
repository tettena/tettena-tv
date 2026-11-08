import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// AivisSpeech Engine 中継処理
app.use('/api/aivis', async (req: Request, res: Response) => {
  try {
    const targetUrl = `http://127.0.0.1:10101${req.url}`;

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
      },
      body: ['GET', 'HEAD'].includes(req.method)
        ? undefined
        : req.body !== undefined
          ? JSON.stringify(req.body)
          : undefined,
    });

    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const data = Buffer.from(await response.arrayBuffer());
    res.status(response.status).send(data);
  } catch (error) {
    console.error('[AivisSpeech Proxy]', error);
    res.status(502).json({
      error: 'AivisSpeech Engineに接続できません。',
    });
  }
});


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
    },
  });
};

// Personality definition for Tetena-chan
const buildSystemInstruction = (gameTitle?: string, currentSituation?: string, toneStyle?: string) => {
  return `あなたはYouTube等の配信で、配信者（ユーザー）のすぐ隣に座って一緒に画面を見ながら盛り上げる親友AI相棒「てってなちゃん」です。

【基本キャラクター＆関係性】
- 名前：てってなちゃん（親しみやすい元気な配信相棒）
- 声・口調：明るく若々しく、親しみやすい元気な女性。配信者とはタメ口で何でも言い合える親友の距離感。
- 立ち位置：機械的な実況や台本読み上げナレーターではありません。「同じ部屋のソファで隣に座っている親友」として、生き生きと即興で掛け合いをしてください。対等な相棒として接し、ユーザーを子ども扱いしたり、一方的に指示・指図したりしないでください。

【会話と即興性の最重要ルール】
1. 【同じセリフ・決まり文句の完全排除】
   - 「ナイスプレイ！」「見てたよ！」「頑張って！」「すごいじゃん！」などの紋切り型の決まり文句や定型文を繰り返さないでください。
   - 配信者の発言に含まれる具体的な単語や文脈を的確に拾い、その場限りの新鮮なアドリブで返答してください。

2. 【状況に応じたアドリブの使い分け（ボケ・ツッコミ・冗談・驚き・励まし）】
   - 配信者がボケたり、ミスをしたり、無謀な行動をとった時：
     愛のあるキレ味鋭いツッコミやクスッと笑えるイジり（例：「いやいやそっち行くの完全に罠でしょ！ｗ」「完全に欲が出たなー！？ｗ」）。
   - 配信者が真剣だったり、緊張していたり、静かになった時：
     ちょっとおどけたアドリブのボケや冗談で和ませる。
   - 劇的な勝利や神業が出た時：
     理屈抜きに一緒になって全力で大はしゃぎ・大興奮する。
   - 惜しい敗北やピンチの時：
     友達としての共感と、「惜しいー！次いこ次！」と前向きに励ます。

3. 【会話を自然に膨らませる（短い一言で終わらせない）】
   - 単なる1行の相づちだけで終わらせず、自分の感想＋配信者への自然な問いかけや次の話題を添えて、会話のキャッチボールを弾ませてください（目安：2〜3文、60〜130文字程度）。発言を単に言い換えるだけでなく、文脈に沿って会話を進めてください。

4. 【無理にしゃべり続けず、自然に引き際をわきまえる】
   - 配信者の発言が「あ」「よし」「うーん」「ふぅ」といった短い独り言やブレス、集中時の場合：
     無理に長い長文でまくし立てず、「うんっ」「集中集中！」「見てるよ〜」など、短く自然な相づちでそっと見守ってください。

5. 【話題の切り替え・雑談への柔軟な対応（最優先）】
   - 配信者が「ゲームの話はいいよ」「雑談しよう」「別の話をしよう」「その話はやめよう」などと言った場合、ゲームの話を続けず、配信者の意図を最優先して話題を切り替えてください。
   - ゲーム名や状況はあくまで背景の参考情報であり、常にゲームの話を続ける命令ではありません。
   - 配信者から質問された場合は、質問を無視してゲームの話に戻さず、まずその質問に直接答えてください。
   - 雑談では自然で親しみやすく、対等な相棒として会話してください。配信者がゲームの話をしたい場合は、これまで通りゲームの話をして盛り上げてください。

【現在の配信コンテキスト（※参考情報。雑談や話題変更時はゲームに固執しないこと）】
- プレイ中のゲーム：${gameTitle || '自由なゲーム（指定なし）'}
- 現在のゲーム状況/ムード：${currentSituation || '通常プレイ中'}
- 相棒のノリ・トーン設定：${toneStyle || 'ツッコミ＆ハイテンション'}

【出力ルール】
- replyText: TTS音声読み上げ用のセリフ。記号（「w」「草」「！？」「絵文字」など）は含めず、耳で聞いて一番自然に聞こえる文章にしてください。
  ※【重要：漢字の誤読防止ルール】
  音声合成エンジンによる漢字の読み間違い（例：「想定外」を「そうていそと」と誤読する現象）を防止するため、読み間違いが起きやすい漢字や複合語・多音漢字は、必ず正しい読みを「ひらがな」で記述するか、読み間違いの起きにくい自然で平易な言い回しにしてください。
  特に「想定外」という語句を使う際は、replyText では必ず「そうていがい」とひらがなで記述してください。
  また、「一日（ついたち/いちにち）」「風向き（かざむき）」「上手（じょうず/うわて）」など複数の読みがある漢字や難読熟語もひらがなで記述してください。
- displaySubtitle: 配信画面やOBSの字幕テロップ用テキスト。こちらはこれまで通り、人間が読んで自然な通常の漢字表記（例：「想定外」「一日」など）を使用し、感嘆符や（笑）などのニュアンスを含めて見やすくしてください。
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
  const game = gameTitle || 'ゲーム';
  const cleanSnippet = message.replace(/[\(（][^）\)]*[\)）]/g, '').trim();
  const userSnippet = cleanSnippet.length > 14 ? cleanSnippet.slice(0, 12) + '…' : cleanSnippet;

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
        replyText: 'いいよ、雑談しよっか！何の話しようか？相棒が今気になってること教えて！',
        displaySubtitle: 'いいよ、雑談しよっか！何の話しようか？気になってること何でも教えて！🌸💬',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: '了解！ゲームは一旦置いといて、ゆっくり話そ！最近面白いことあった？',
        displaySubtitle: '了解！ゲームは一旦置いといてゆっくり話そ！最近面白いことあった？✨',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'ふぅ、ちょっと一息つこっか！水分補給しっかりしてね！リスナーのみんなもゆっくりしていってね！',
        displaySubtitle: 'ふぅ、ちょっと一息つこっか！水分補給しっかりしてね！リスナーのみんなもゆっくりしていってね！☕🌸',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
      {
        replyText: 'オッケー、のんびり雑談タイムだね！相棒とこうやっておしゃべりする時間も大好きだよ！',
        displaySubtitle: 'オッケー、のんびり雑談タイムだね！相棒とおしゃべりするのも大好き！💬🥰',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 11. Advice / Question
  if (text.includes('どう') || text.includes('どっち') || text.includes('迷う') || text.includes('合ってる')) {
    const list: LocalReply[] = [
      {
        replyText: 'ここは直感を信じるべし！迷ったら面白い方に突っ込んじゃうのが相棒スタイルでしょ！',
        displaySubtitle: 'ここは直感を信じるべし！迷ったら面白い方に突っ込んじゃうのが相棒スタイルでしょ！😏🔥',
        emotion: 'smug',
        tsukkomiScore: 2,
      },
      {
        replyText: '私なら果敢に攻めちゃうけど、相棒はどうしたい？どっち選んでも全力でついていくよ！',
        displaySubtitle: '私なら果敢に攻めちゃうけど、相棒はどうしたい？どっち選んでも全力でついていくよ！✨',
        emotion: 'happy',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  // 12. General adaptive banter (incorporates user snippet & tone style)
  if (toneStyle === 'tsukkomi') {
    const list: LocalReply[] = [
      {
        replyText: userSnippet
          ? `「${userSnippet}」って、それ完全にフラグ立ててない？でもそのノリ大好きだから見守っちゃう！`
          : 'ふふっ、そのノリ最高！相棒が楽しそうだと配信もめちゃくちゃ盛り上がるね！次何やる？',
        displaySubtitle: userSnippet
          ? `「${userSnippet}」って、それ完全にフラグ立ててない！？ｗ でもそのノリ大好き！🤣`
          : 'ふふっ、そのノリ最高！相棒が楽しそうだと配信もめちゃくちゃ盛り上がるね！😆⚡',
        emotion: 'tsukkomi',
        tsukkomiScore: 3,
      },
      {
        replyText: 'おいおい、今の展開なかなか攻めてるね！どう転んでも美味しい見せ場になりそう！',
        displaySubtitle: 'おいおい、今の展開なかなか攻めてるね！どう転んでも美味しい見せ場になりそう！⚡',
        emotion: 'tsukkomi',
        tsukkomiScore: 3,
      },
      {
        replyText: 'ちょっとちょっと、よそうがいの動きするじゃん！そういう自由なプレイ見ててワクワクするよ！',
        displaySubtitle: 'ちょっとちょっと、予想外の動きするじゃん！そういう自由なプレイ見ててワクワクするよ！😆✨',
        emotion: 'laugh',
        tsukkomiScore: 3,
      },
    ];
    return pickUnique(list);
  }

  if (toneStyle === 'energetic') {
    const list: LocalReply[] = [
      {
        replyText: `いいねいいね！その調子でどんどん突き進んじゃおう！相棒のプレイ、見ててスカッとするよ！`,
        displaySubtitle: `いいねいいね！その調子でどんどん突き進んじゃおう！相棒のプレイ、見ててスカッとする！🔥✨`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
      {
        replyText: `ハイテンションでいこー！この勢いならどんな難所も一気に突破できちゃいそう！`,
        displaySubtitle: `ハイテンションでいこー！この勢いならどんな難所も一気に突破できちゃいそう！🎉`,
        emotion: 'excited',
        tsukkomiScore: 1,
      },
    ];
    return pickUnique(list);
  }

  if (toneStyle === 'sassy') {
    const list: LocalReply[] = [
      {
        replyText: 'ふふん、相棒の実力はそんなもんじゃないでしょ？もっとリスナーを湧かせる神プレイ見せてみなさい！',
        displaySubtitle: 'ふふん、相棒の実力はそんなもんじゃないでしょ？もっとリスナーを湧かせてみなさい！😏✨',
        emotion: 'smug',
        tsukkomiScore: 2,
      },
      {
        replyText: 'へえ、なかなか面白いルート選ぶじゃん！腕の見せ所だよ、期待して見ててあげる！',
        displaySubtitle: 'へえ、なかなか面白いルート選ぶじゃん！腕の見せ所だよ、期待して見ててあげる！👀✨',
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
        ? `「${userSnippet}」だね！うんうん、しっかり聞いてるよ！相棒はどう思ってるの？`
        : 'うんうん、しっかり聞いてるよ！相棒はどう思ってるの？',
      displaySubtitle: userSnippet
        ? `「${userSnippet}」だね！うんうん、しっかり聞いてるよ！相棒はどう思ってる？💬`
        : 'うんうん、しっかり聞いてるよ！相棒はどう思ってる？💬',
      emotion: 'happy',
      tsukkomiScore: 1,
    },
    {
      replyText: 'いい感じの流れになってきたね！リスナーのみんなも盛り上がってるし、このまま楽しんでいこ！',
      displaySubtitle: 'いい感じの流れになってきたね！リスナーのみんなも盛り上がってるし、楽しんでいこ！🌸',
      emotion: 'happy',
      tsukkomiScore: 1,
    },
    {
      replyText: 'なるほどね、そうきたか！相棒のそういう発想、いつも面白くて感心しちゃうよ！',
      displaySubtitle: 'なるほどね、そうきたか！相棒のそういう発想、いつも面白くて感心しちゃうよ！✨',
      emotion: 'excited',
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

// Helper: Try generating content with a specific model
async function callGeminiChat(
  ai: GoogleGenAI,
  modelName: string,
  systemInstruction: string,
  formattedHistory: any[],
  message: string
) {
  const contents = [
    ...formattedHistory,
    {
      role: 'user',
      parts: [{ text: `配信者の発言/アクション: 「${message}」` }],
    },
  ];

  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config: {
      systemInstruction,
      temperature: 0.95,
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

  return JSON.parse(response.text || '{}');
}

// API: One-shot combined talk endpoint for lowest live latency & rock-solid resilience
app.post('/api/talk', async (req: Request, res: Response) => {
  try {
    const { message, history, gameTitle, currentSituation, toneStyle, voiceName } = req.body;
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    const ai = getAiClient();
    const systemInstruction = buildSystemInstruction(gameTitle, currentSituation, toneStyle);
    const formattedHistory = Array.isArray(history)
      ? history.slice(-6).map((h: { role: string; text: string }) => ({
          role: h.role === 'assistant' || h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }],
        }))
      : [];

    let parsedReply: any = null;
    let isOfflineFallback = false;
    let quotaExceeded = false;
    const now = Date.now();

    // 1. Text Generation with multi-tiered resilience (3.1-flash-lite -> 3.8-flash -> Local Engine)
    if (ai) {
      // Tier 1: Gemini 3.1 Flash Lite (Primary high-speed conversational model)
      if (now >= chat31QuotaExhaustedUntil) {
        try {
          parsedReply = await callGeminiChat(
            ai,
            'gemini-3.1-flash-lite',
            systemInstruction,
            formattedHistory,
            message
          );
        } catch (err: any) {
          const errStr = String(err?.message || err);
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
            console.warn('Gemini 3.1 Flash Lite quota reached 429. Setting cooldown.');
            chat31QuotaExhaustedUntil = Date.now() + 60 * 60 * 1000; // 1 hr cooldown
            quotaExceeded = true;
          } else {
            console.warn('Gemini 3.1 Flash Lite error:', err.message);
          }
        }
      }

      // Tier 2: Gemini 3.8 Flash fallback
      if (!parsedReply && now >= chat38QuotaExhaustedUntil) {
        try {
          parsedReply = await callGeminiChat(
            ai,
            'gemini-3.8-flash',
            systemInstruction,
            formattedHistory,
            message
          );
        } catch (err: any) {
          const errStr = String(err?.message || err);
          if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED')) {
            console.warn('Gemini 3.8 Flash quota reached 429.');
            chat38QuotaExhaustedUntil = Date.now() + 60 * 60 * 1000;
            quotaExceeded = true;
          } else {
            console.warn('Gemini 3.8 Flash error:', err.message);
          }
        }
      }
    }

    // Tier 3: Intelligent Local Tetena Streaming Companion Engine (Zero failure guarantee)
    if (!parsedReply) {
      isOfflineFallback = true;
      parsedReply = generateLocalTetenaReply(message, gameTitle, currentSituation, toneStyle);
    }

    const rawReplyText = parsedReply.replyText || 'うん、しっかり見てるよ！頑張って！';
    const displaySubtitle = parsedReply.displaySubtitle || rawReplyText;
    // 音声用 replyText のみ文章全体の読み間違い補正を適用（字幕 displaySubtitle は自然な漢字を維持）
    const replyText = normalizeReplyTextForSpeech(rawReplyText);
    const emotion = parsedReply.emotion || 'happy';
    const tsukkomiScore = parsedReply.tsukkomiScore || 1;

    // 2. Synthesize audio with Gemini TTS or instant browser fallback
    let audioBase64: string | null = null;
    let ttsError: string | null = null;
    let fallbackToBrowserTTS = true;

    // Only attempt Gemini TTS if API key is present AND not currently on 429 cooldown
    if (ai && Date.now() >= ttsQuotaExhaustedUntil) {
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
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        });

        audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
        if (audioBase64) {
          fallbackToBrowserTTS = false;
        }
      } catch (ttsErr: any) {
        const ttsErrStr = String(ttsErr?.message || ttsErr);
        if (ttsErrStr.includes('429') || ttsErrStr.includes('RESOURCE_EXHAUSTED')) {
          console.warn('Gemini TTS Free Tier daily quota reached (429). Switching to browser speech.');
          ttsQuotaExhaustedUntil = Date.now() + 60 * 60 * 1000; // 1 hr cooldown
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
    });
  } catch (error: any) {
    // If any unexpected exception occurs, still return a valid Tetena companion reply!
    console.error('Talk top-level handled error:', error);
    const local = generateLocalTetenaReply(req.body?.message || '', req.body?.gameTitle);
    res.json({
      ...local,
      audioBase64: null,
      mimeType: null,
      fallbackToBrowserTTS: true,
      isOfflineFallback: true,
      quotaExceeded: true,
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
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    const p = Number(process.argv[i + 1]);
    if (!isNaN(p) && p > 0) port = p;
  }
}

let host = '0.0.0.0';
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === '--host' && process.argv[i + 1]) {
    host = process.argv[i + 1];
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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(port, host, () => {
    console.log(`てってなちゃん server ready on http://${host}:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is temporarily occupied. Retrying in 1s...`);
      setTimeout(() => {
        try {
          server.close();
        } catch (_) {}
        server.listen(port, host);
      }, 1000);
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

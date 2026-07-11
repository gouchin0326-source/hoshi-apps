/* OCR後処理層 — 購買サーチ ③画面キャプチャ→OCR 用
 *
 * ★単一の正: このファイルは app/ と extension/ に同一内容で複製配置する
 *   （拡張は自フォルダ外を読めず、本体HTMLはスタンドアロンのため物理共有が不可能）。
 *   編集時は必ず両方へ同じ内容を反映し、`fc /b`（または diff）で一致を確認すること。
 *
 * ★VISION_LAB scripts/text_cleaner.py の知見を JS 移植(GO_spec_C 設計)。
 *   1. CJK対応スペース除去  — OCR が日本語文字間に挿入する不要スペースを除去
 *   2. 全角→半角 正規化     — 価格抽出に必須(￥０１２ → ¥012 にしないと数値化できない)
 *   3. 濁点・半濁点 位置ズレ修正 — 機械的・安全(カ゛→ガ 等)
 *   4. 商品ドメイン誤認識テーブル — シード(空)。実OCR失敗を観測して少しずつ拡充する
 *
 * ★VISION_LAB の UI用語テーブル(録画/ファイル/ツール等)は流用しない。
 * UI語向けで購買ドメインの商品名・メーカー名を過剰補正する恐れがあるため。
 *
 * ブラウザ(window.OCRPost)・node(module.exports)両対応。
 */
(function () {
  'use strict';

  // CJK 文字クラス(ひらがな/カタカナ/漢字/全角記号/CJK拡張A)
  var CJK = '[\\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF\\u4E00-\\u9FFF\\uFF00-\\uFFEF\\u3400-\\u4DBF]';
  var CJK_RE = new RegExp(CJK);

  function hasCJK(s) { return CJK_RE.test(s); }

  function isLongAsciiWord(s) {
    if (s.length < 4) return false;
    return /^[A-Za-z]+$/.test(s);
  }

  function isDigitToken(s) {
    return s.length > 0 && /^[0-9]+$/.test(s);
  }

  // ----- 1. OCRスペース除去 -----
  // 行に CJK を含む(日本語主体)なら、長ASCII語の境界だけスペースを残し他は結合。
  function removeOcrSpaces(text) {
    text = String(text == null ? '' : text).trim().replace(/ {2,}/g, ' ');
    if (!hasCJK(text)) return text;
    var tokens = text.split(' ');
    if (tokens.length <= 1) return text;
    var out = [tokens[0]];
    for (var i = 1; i < tokens.length; i++) {
      var prev = tokens[i - 1], curr = tokens[i], keep = false;
      if (isLongAsciiWord(prev) && isLongAsciiWord(curr)) keep = true;       // 長ASCII同士
      else if (isLongAsciiWord(prev) && hasCJK(curr)) keep = true;           // 長ASCII + CJK
      else if (hasCJK(prev) && isLongAsciiWord(curr)) keep = true;           // CJK + 長ASCII
      else if (isLongAsciiWord(prev) && isDigitToken(curr)) keep = true;     // 長ASCII + 数字
      if (keep) out.push(' ');
      out.push(curr);
    }
    return out.join('');
  }

  // ----- 2. 全角→半角 正規化(価格抽出・型番に必須)-----
  // 全角ASCIIブロック(U+FF01–FF5E)は cp-0xFEE0 で半角に対応。
  // 全角英数字・記号・桁区切りカンマをまとめて正規化する(型番 Ｍ８-５０ → M8-50 等)。
  function normalizeFullwidth(text) {
    if (!text) return text;
    var res = '';
    for (var i = 0; i < text.length; i++) {
      var cp = text.charCodeAt(i);
      if (cp >= 0xFF01 && cp <= 0xFF5E) res += String.fromCharCode(cp - 0xFEE0);
      else if (cp === 0xFFE5) res += '¥';  // ￥ 全角円記号 → ¥
      else res += text[i];
    }
    return res;
  }

  // ----- 3. 濁点・半濁点 位置ズレ修正 -----
  var DAKUTEN = {
    'カ゛': 'ガ', 'キ゛': 'ギ', 'ク゛': 'グ', 'ケ゛': 'ゲ', 'コ゛': 'ゴ',
    'サ゛': 'ザ', 'シ゛': 'ジ', 'ス゛': 'ズ', 'セ゛': 'ゼ', 'ソ゛': 'ゾ',
    'タ゛': 'ダ', 'チ゛': 'ヂ', 'ツ゛': 'ヅ', 'テ゛': 'デ', 'ト゛': 'ド',
    'ハ゛': 'バ', 'ヒ゛': 'ビ', 'フ゛': 'ブ', 'ヘ゛': 'ベ', 'ホ゛': 'ボ',
    'ハ゜': 'パ', 'ヒ゜': 'ピ', 'フ゜': 'プ', 'ヘ゜': 'ペ', 'ホ゜': 'ポ'
  };

  // ----- 4. 商品ドメイン誤認識テーブル(シード)-----
  // 過剰補正を避けるため空で開始する。実 OCR の失敗を観測したら
  // 「誤 → 正」の語(文字単体ではなく、購買ドメインで一意に判別できる語)を追加する。
  // 例) メーカー名・型番・規格表記の確定的な誤認識のみ。曖昧な字形置換は入れない。
  var PRODUCT_FIXES = {};

  function applyTable(text, table) {
    if (!text) return text;
    // 多文字キー(語)を長い順に置換
    var multi = [];
    for (var k in table) {
      if (table.hasOwnProperty(k) && k.length > 1) multi.push(k);
    }
    multi.sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < multi.length; i++) {
      var src = multi[i], dst = table[src];
      if (src !== dst) text = text.split(src).join(dst);
    }
    // 単一文字キーは1パスで一括変換
    var charMap = {}, hasChar = false;
    for (var c in table) {
      if (table.hasOwnProperty(c) && c.length === 1 && table[c].length === 1 && c !== table[c]) {
        charMap[c] = table[c]; hasChar = true;
      }
    }
    if (hasChar) {
      var res = '';
      for (var j = 0; j < text.length; j++) {
        var ch = text[j];
        res += (charMap[ch] !== undefined ? charMap[ch] : ch);
      }
      text = res;
    }
    return text;
  }

  function applyOcrFixes(text) {
    if (!text) return text;
    text = normalizeFullwidth(text);
    text = applyTable(text, DAKUTEN);
    text = applyTable(text, PRODUCT_FIXES);
    return text;
  }

  // CJK文脈のハイフン → 長音(商品名 "ボール-ペン" → "ボールーペン")
  var CJK_HYPHEN_RE = new RegExp('(?<=' + CJK + ') ?- ?(?=' + CJK + ')', 'g');
  // 英字1文字区切りの頭字語結合 "U S B" → "USB"
  var ACRONYM_RE = /(?<![A-Za-z])(?:[A-Z]\s){1,}[A-Z](?![A-Za-z])/g;

  function cleanOcrLine(line) {
    line = String(line == null ? '' : line).trim();
    if (!line) return line;
    line = line.replace(CJK_HYPHEN_RE, 'ー');
    line = line.replace(ACRONYM_RE, function (m) { return m.replace(/\s/g, ''); });
    line = applyOcrFixes(line);
    line = removeOcrSpaces(line);
    return line;
  }

  // 複数行の OCR テキスト全体をクリーニング(連続空行は1行に圧縮)
  function cleanOcrText(text) {
    if (text == null) return text;
    var lines = String(text).split('\n');
    var out = [], prevEmpty = false;
    for (var i = 0; i < lines.length; i++) {
      var l = cleanOcrLine(lines[i]);
      if (l === '') {
        if (!prevEmpty) out.push(l);
        prevEmpty = true;
      } else {
        out.push(l);
        prevEmpty = false;
      }
    }
    return out.join('\n');
  }

  var api = {
    cleanOcrText: cleanOcrText,
    cleanOcrLine: cleanOcrLine,
    removeOcrSpaces: removeOcrSpaces,
    applyOcrFixes: applyOcrFixes,
    normalizeFullwidth: normalizeFullwidth,
    _tables: { DAKUTEN: DAKUTEN, PRODUCT_FIXES: PRODUCT_FIXES }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // ブラウザ(window)・Service Worker(self)・node いずれでも globalThis 経由で公開
  if (typeof globalThis !== 'undefined') globalThis.OCRPost = api;
})();

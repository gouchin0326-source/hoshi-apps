/*!
 * verify_bus.js — バス検証ハーネス (W2-2)
 * 正本設計書: HOSHI/knowledge/fable5_legacy/SPEC_W2-2_BUS_VERIFY_2026-07-19.md
 * 契約正本   : HOSHI/knowledge/SPEC_MOBILE_ECOSYSTEM_LINK_2026-07-12.md §C-1/C-2
 *
 * 方針:
 *   - 素のスクリプト（import/export を使わない）。ビルド無し・依存パッケージゼロ。
 *   - node と ブラウザ（<script src>）で同一ソースが動く。
 *   - fail-closed: 検証できなかったものを合格と言わない（E00 は「判定不能」として不合格）。
 *   - 決定論のみ: 乱数・現在時刻・ネットワーク・LLM を一切使わない。
 *
 * 公開: globalThis.BusVerify = { verify, verifyText, diff, selfTest, format,
 *                               SCHEMAS_VERSION, CODES }
 */
(function (root) {
  'use strict';

  /* 1.1.0: E23（未知type）を追加＝規則が増えたのでマイナーを上げる（2026-07-19 追補） */
  var SCHEMAS_VERSION = '1.1.0';
  /* ESM 環境での自己起動判定に使う自ファイル名。リネーム時はここも直すこと（設計書 §7 注記）。 */
  var SCRIPT_NAME = 'verify_bus.js';

  /* ---------- 定数（設計書 §2 / §5） ---------- */
  var LIMIT_RAW_BYTES = 64 * 1024;          /* E03: 1項目のraw上限 */
  var LIMIT_TOTAL_BYTES = 2 * 1024 * 1024;  /* E03: 全体上限 */
  var C1_MAX_ITEMS = 3;                     /* E09: #paste= は3件程度まで */

  var SOURCES = ['manual', 'share', 'paste', 'photo_ocr'];      /* E10 */
  /* E23（2026-07-19 追補・司令塔裁定）: 設計書§2の表に type の列挙コードが無く、異常な type が素通りしていた。
     fail-closed に反するため新設。列挙は親書§C C1 の text|url|price_item を正とし、それ以外は全てFAIL。 */
  var TYPES = ['text', 'url', 'price_item'];                    /* E23 */
  var STATUS_ORDER = { raw: 0, structured: 1, exported: 2 };    /* E07 / E21 */
  var URL_KEYS = ['url', 'image', 'link', 'src', 'href', 'imageUrl', 'image_url']; /* E05 */

  var KIND_LIST = ['c1', 'queue', 'export'];

  var REQUIRED_ROOT = {
    c1: ['_batch', 'items'],
    queue: ['app', 'kind', 'version', 'items'],
    /* export の exportedAt は §1 S3 の外枠定義 {app,kind,version,exportedAt,...} から導出（§2 E01 表は明記していない＝設計書の穴として報告） */
    'export': ['app', 'kind', 'version', 'exportedAt', 'items']
  };
  /* items 要素の必須キー（キュー形/控え形のみ。C1形の要素必須キーは正本#39が列挙していない＝型検査どまり） */
  var REQUIRED_ITEM_QUEUE = ['id', 'capturedAt', 'source', 'type', 'raw', 'status'];

  var KNOWN_ROOT = {
    c1: ['_batch', 'items'],
    queue: ['app', 'kind', 'version', 'device', 'items'],
    'export': ['app', 'kind', 'version', 'device', 'exportedAt', 'items']
  };
  var KNOWN_ITEM_QUEUE = ['id', 'capturedAt', 'source', 'type', 'raw', 'extracted', 'status', 'note'];
  var KNOWN_ITEM_C1 = ['site', 'title', 'price', 'partNo', 'maker', 'url', 'image',
                       'delivery', 'keyword', 'capturedAt', 'pageType'];

  var CODES = {
    E00: 'JSONとして読めない／ルートがオブジェクトでない（判定不能）',
    E01: '必須キー欠落',
    E02: '型違い',
    E03: '大きすぎる',
    E04: '空',
    E05: '危険なURLスキーム',
    E06: '重複id',
    E07: 'statusが決められた値でない',
    E08: '日付がISO8601でない',
    E09: '件数超過',
    E10: '未知source',
    E23: '未知type（2026-07-19 追補）',
    E20: '項目消失（append-only違反）',
    E21: 'status後退',
    E22: '既存項目の改変',
    W01: '未知キー（警告のみ・合否に影響しない）'
  };

  /* ---------- 小道具（環境非依存） ---------- */

  function byteLen(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    /* TextEncoder が無い古い環境のための保険（node/現行ブラウザでは使われない） */
    return unescape(encodeURIComponent(s)).length;
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /* ISO8601 の決定論的判定。Date の緩いパースに頼らず、形＋実在日時の両方を見る。 */
  var ISO_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  function isIso8601(v) {
    if (typeof v !== 'string' || !ISO_RE.test(v)) return false;
    var t = Date.parse(v.replace(' ', 'T'));
    return !isNaN(t);
  }

  function err(list, code, path, message) {
    list.push({ code: code, path: path, message: message });
  }

  /* ---------- 検査本体 ---------- */

  function checkUrlish(node, path, errors, depth) {
    if (depth > 12 || node === null || typeof node !== 'object') return;
    var i, k;
    if (Array.isArray(node)) {
      for (i = 0; i < node.length; i++) checkUrlish(node[i], path + '[' + i + ']', errors, depth + 1);
      return;
    }
    for (k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      var v = node[k];
      var p = path + '.' + k;
      if (URL_KEYS.indexOf(k) >= 0) {
        if (v === null || v === undefined || v === '') continue;   /* 未入力は違反にしない */
        if (typeof v !== 'string') {
          err(errors, 'E02', p, 'URLは もじれつで かいてください');
          continue;
        }
        /* 絶対URL（https:// または http://）だけを通す。相対URL（/item/1 等）もFAIL。
           #39が可否を書いていないため、緩めずに厳しい側で固定する（司令塔裁定 2026-07-19）。 */
        if (!/^https?:\/\//i.test(v)) {
          err(errors, 'E05', p, '「' + v.slice(0, 40) + '」は つかえません（https:// か http:// で はじまるものだけ）');
        }
        continue;
      }
      if (v !== null && typeof v === 'object') checkUrlish(v, p, errors, depth + 1);
    }
  }

  function warnUnknownKeys(obj, known, path, warnings) {
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (known.indexOf(k) < 0) {
        warnings.push({ code: 'W01', path: path + '.' + k, message: 'しらないキーです（あたらしいキーは ついかできます）' });
      }
    }
  }

  function needString(obj, key, path, errors) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return;
    if (typeof obj[key] !== 'string') {
      err(errors, 'E02', path + '.' + key, 'もじれつで かいてください');
    }
  }

  function verify(input, kind) {
    if (KIND_LIST.indexOf(kind) < 0) {
      throw new TypeError('kind は ' + KIND_LIST.join(' / ') + ' のどれかにしてください: ' + kind);
    }
    var errors = [], warnings = [];
    var obj = input;

    if (typeof input === 'string') {
      try {
        obj = JSON.parse(input);
      } catch (e) {
        err(errors, 'E00', '(root)', 'JSONとして よめません（' + String(e.message).slice(0, 80) + '）');
        return result(kind, errors, warnings, 0, true);
      }
    }

    if (!isPlainObject(obj)) {
      err(errors, 'E00', '(root)', 'いちばん外側は { } の かたちに してください');
      return result(kind, errors, warnings, 0, true);
    }

    /* --- ルート必須キー（E01） --- */
    var req = REQUIRED_ROOT[kind], i;
    for (i = 0; i < req.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(obj, req[i])) {
        err(errors, 'E01', req[i], 'ないと こまります（かならず いれてください）');
      }
    }
    warnUnknownKeys(obj, KNOWN_ROOT[kind], '(root)', warnings);

    /* --- ルート型（E02） --- */
    if (kind === 'c1') {
      if (Object.prototype.hasOwnProperty.call(obj, '_batch') && obj._batch !== true) {
        err(errors, 'E02', '_batch', 'true で なければ いけません');
      }
    } else {
      needString(obj, 'app', '(root)', errors);
      needString(obj, 'kind', '(root)', errors);
      needString(obj, 'device', '(root)', errors);
      if (Object.prototype.hasOwnProperty.call(obj, 'version') && typeof obj.version !== 'number') {
        err(errors, 'E02', 'version', 'すうじで かいてください');
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'exportedAt') && !isIso8601(obj.exportedAt)) {
        err(errors, 'E08', 'exportedAt', '日づけの かたちが ちがいます（れい 2026-07-19T10:00:00+09:00）');
      }
    }

    /* --- 全体サイズ（E03・キュー形/控え形） --- */
    if (kind !== 'c1') {
      var total = byteLen(JSON.stringify(obj));
      if (total > LIMIT_TOTAL_BYTES) {
        err(errors, 'E03', '(root)', 'ぜんたいが おおきすぎます（' + total + 'バイト／じょうげん ' + LIMIT_TOTAL_BYTES + '）');
      }
    }

    /* --- items --- */
    var items = obj.items;
    var itemCount = 0;
    if (Object.prototype.hasOwnProperty.call(obj, 'items')) {
      if (!Array.isArray(items)) {
        err(errors, 'E02', 'items', 'リスト（[ ]）で かいてください');
        items = null;
      }
    } else {
      items = null;
    }

    if (items) {
      itemCount = items.length;
      if (kind === 'c1') {
        if (items.length === 0) err(errors, 'E04', 'items', 'からっぽでは おくれません（1けん いじょう）');
        if (items.length > C1_MAX_ITEMS) {
          err(errors, 'E09', 'items', 'おおすぎます（' + items.length + 'けん／いちどに ' + C1_MAX_ITEMS + 'けんまで）');
        }
      }
      var seen = {};
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        var p = 'items[' + i + ']';
        if (!isPlainObject(it)) {
          err(errors, 'E02', p, '{ } の かたちに してください');
          continue;
        }

        if (kind === 'c1') {
          warnUnknownKeys(it, KNOWN_ITEM_C1, p, warnings);
          if (Object.prototype.hasOwnProperty.call(it, 'price')) {
            if (!(typeof it.price === 'number' || it.price === null)) {
              err(errors, 'E02', p + '.price', 'すうじ か null で かいてください');
            }
          }
          ['site', 'title', 'partNo', 'maker', 'delivery', 'keyword', 'pageType'].forEach(function (k) {
            needString(it, k, p, errors);
          });
          if (Object.prototype.hasOwnProperty.call(it, 'capturedAt') && !isIso8601(it.capturedAt)) {
            err(errors, 'E08', p + '.capturedAt', '日づけの かたちが ちがいます（れい 2026-07-19T10:00:00+09:00）');
          }
        } else {
          /* 必須キー（E01） */
          for (var r = 0; r < REQUIRED_ITEM_QUEUE.length; r++) {
            if (!Object.prototype.hasOwnProperty.call(it, REQUIRED_ITEM_QUEUE[r])) {
              err(errors, 'E01', p + '.' + REQUIRED_ITEM_QUEUE[r], 'ないと こまります（かならず いれてください）');
            }
          }
          warnUnknownKeys(it, KNOWN_ITEM_QUEUE, p, warnings);
          ['id', 'type', 'note'].forEach(function (k) { needString(it, k, p, errors); });

          if (Object.prototype.hasOwnProperty.call(it, 'raw')) {
            if (typeof it.raw !== 'string') {
              err(errors, 'E02', p + '.raw', 'もじれつで かいてください');
            } else {
              var rb = byteLen(it.raw);
              if (rb > LIMIT_RAW_BYTES) {
                err(errors, 'E03', p + '.raw', 'ながすぎます（' + rb + 'バイト／じょうげん ' + LIMIT_RAW_BYTES + '）');
              }
            }
          }
          if (Object.prototype.hasOwnProperty.call(it, 'extracted')) {
            if (!(it.extracted === null || isPlainObject(it.extracted))) {
              err(errors, 'E02', p + '.extracted', '{ } か null に してください');
            }
          }
          if (Object.prototype.hasOwnProperty.call(it, 'capturedAt') && !isIso8601(it.capturedAt)) {
            err(errors, 'E08', p + '.capturedAt', '日づけの かたちが ちがいます（れい 2026-07-19T10:00:00+09:00）');
          }
          /* E23 未知type（文字列である場合のみ。非文字列は上の needString が E02 で弾く） */
          if (Object.prototype.hasOwnProperty.call(it, 'type') && typeof it.type === 'string' &&
              TYPES.indexOf(it.type) < 0) {
            err(errors, 'E23', p + '.type', '「' + it.type + '」は しらない しゅるいです（' + TYPES.join(' / ') + ' のどれか）');
          }
          if (Object.prototype.hasOwnProperty.call(it, 'source') && SOURCES.indexOf(it.source) < 0) {
            err(errors, 'E10', p + '.source', '「' + String(it.source) + '」は しらない でどころです（' + SOURCES.join(' / ') + ' のどれか）');
          }
          if (Object.prototype.hasOwnProperty.call(it, 'status') &&
              !Object.prototype.hasOwnProperty.call(STATUS_ORDER, it.status)) {
            err(errors, 'E07', p + '.status', '「' + String(it.status) + '」は つかえません（raw / structured / exported のどれか）');
          }
          /* 重複id（E06） */
          if (typeof it.id === 'string') {
            if (seen[it.id]) {
              err(errors, 'E06', p + '.id', '「' + it.id + '」は まえの こうもくと おなじです（idは ひとつずつ）');
            }
            seen[it.id] = true;
          }
        }

        /* URL系フィールド（E05）— rawやnoteは文字列なので走査対象にならない＝<script>本文は合法のまま */
        checkUrlish(it, p, errors, 0);
      }
    }

    return result(kind, errors, warnings, itemCount, false);
  }

  function result(kind, errors, warnings, itemCount, undetermined) {
    return {
      ok: errors.length === 0,
      undetermined: !!undetermined,
      kind: kind,
      schemasVersion: SCHEMAS_VERSION,
      itemCount: itemCount,
      errors: errors,
      warnings: warnings,
      codes: errors.map(function (e) { return e.code; })
    };
  }

  function verifyText(text, kind) { return verify(String(text), kind); }

  /* ---------- diff モード（設計書 §5・append-only=W5の機械検証） ---------- */

  function diff(oldInput, newInput, opts) {
    opts = opts || {};
    var kind = opts.kind || 'queue';
    var allowDelete = !!opts.allowDelete;

    /* fail-closed: 片方でも形が壊れていたら「後退なし」とは言えない。まず両方を通常検証する。 */
    var ro = verify(oldInput, kind);
    var rn = verify(newInput, kind);
    var errors = [], warnings = [];
    ro.errors.forEach(function (e) { errors.push({ code: e.code, path: 'old:' + e.path, message: e.message }); });
    rn.errors.forEach(function (e) { errors.push({ code: e.code, path: 'new:' + e.path, message: e.message }); });
    ro.warnings.forEach(function (w) { warnings.push({ code: w.code, path: 'old:' + w.path, message: w.message }); });
    rn.warnings.forEach(function (w) { warnings.push({ code: w.code, path: 'new:' + w.path, message: w.message }); });

    if (ro.undetermined || rn.undetermined) {
      return { ok: false, undetermined: true, kind: kind, schemasVersion: SCHEMAS_VERSION,
               itemCount: 0, errors: errors, warnings: warnings,
               codes: errors.map(function (e) { return e.code; }) };
    }

    var oldObj = typeof oldInput === 'string' ? JSON.parse(oldInput) : oldInput;
    var newObj = typeof newInput === 'string' ? JSON.parse(newInput) : newInput;
    var oldItems = Array.isArray(oldObj.items) ? oldObj.items : [];
    var newItems = Array.isArray(newObj.items) ? newObj.items : [];

    var byId = {}, i;
    for (i = 0; i < newItems.length; i++) {
      if (isPlainObject(newItems[i]) && typeof newItems[i].id === 'string') byId[newItems[i].id] = newItems[i];
    }

    for (i = 0; i < oldItems.length; i++) {
      var o = oldItems[i];
      if (!isPlainObject(o) || typeof o.id !== 'string') continue;
      var n = byId[o.id];
      var p = 'id=' + o.id;

      if (!n) {
        if (!allowDelete) {
          err(errors, 'E20', p, 'まえに あった こうもくが きえています（けすのは せいりモードだけ）');
        }
        continue;
      }
      /* E21 status後退 */
      var ao = STATUS_ORDER[o.status], an = STATUS_ORDER[n.status];
      if (typeof ao === 'number' && typeof an === 'number' && an < ao) {
        err(errors, 'E21', p + '.status', '「' + o.status + '」から「' + n.status + '」へ もどっています（すすむだけ）');
      }
      /* E22 既存項目の改変（extracted/note/status の変化は合法） */
      ['raw', 'capturedAt', 'source'].forEach(function (k) {
        if (o[k] !== n[k]) {
          err(errors, 'E22', p + '.' + k, 'あとから かきかえられています（げんぶんは かえられません）');
        }
      });
    }

    return { ok: errors.length === 0, undetermined: false, kind: kind, schemasVersion: SCHEMAS_VERSION,
             itemCount: newItems.length, errors: errors, warnings: warnings,
             codes: errors.map(function (e) { return e.code; }) };
  }

  /* ---------- 出力整形（1違反=1行） ---------- */

  function format(res) {
    var lines = [];
    res.errors.forEach(function (e) { lines.push(e.code + ' ' + e.path + ' ' + e.message); });
    res.warnings.forEach(function (w) { lines.push(w.code + ' ' + w.path + ' ' + w.message); });
    return lines;
  }

  /* ---------- 内蔵fixture と selftest（設計書 §3・§6 H1/H2） ---------- */

  function iso(s) { return s; } /* 固定文字列を使う＝現在時刻に依存しない */

  function qItem(over) {
    var base = { id: 'gp-1752900000000-0001', capturedAt: iso('2026-07-19T10:00:00+09:00'),
                 source: 'manual', type: 'text', raw: 'ボルト M8 を 30ぽん', extracted: null,
                 status: 'raw', note: '' };
    for (var k in (over || {})) base[k] = over[k];
    return base;
  }
  function queueDoc(items, over) {
    var d = { app: 'genba_pocket', kind: 'capture_queue', version: 1, device: 'なまえのない たんまつ', items: items };
    for (var k in (over || {})) d[k] = over[k];
    return d;
  }

  function fixtures() {
    var good = [
      { name: 'G1 C1形・3件・正形', kind: 'c1', doc: {
          _batch: true, items: [
            { site: 'shopA', title: 'ボルト M8', price: 120, url: 'https://example.com/a', image: 'https://example.com/a.png' },
            { site: 'shopB', title: 'ナット M8', price: null, url: 'https://example.com/b' },
            { site: 'shopC', title: 'ワッシャ', price: 40, url: 'http://example.com/c' }
          ] } },
      { name: 'G2 キュー形・raw に <script> を含む正形（H3）', kind: 'queue', doc:
          queueDoc([ qItem({ raw: '<script>alert(1)</script> これは ただの もじです' }),
                     qItem({ id: 'gp-1752900000000-0002', status: 'structured',
                             extracted: { site: 'shopA', title: 'ボルト', price: 120, url: 'https://example.com/a' } }) ]) },
      { name: 'G3 控え形・正形', kind: 'export', doc:
          queueDoc([ qItem({ status: 'exported' }) ], { exportedAt: '2026-07-19T12:34:00+09:00' }) }
    ];

    var bad = [
      { name: 'B01 キー欠落（version が無い）', kind: 'queue', expect: ['E01'],
        doc: (function () { var d = queueDoc([qItem()]); delete d.version; return d; })() },
      { name: 'B02 型違い（items が配列でない）', kind: 'queue', expect: ['E02'],
        doc: queueDoc('リストじゃない') },
      { name: 'B03 巨大（raw が 64KB 超）', kind: 'queue', expect: ['E03'],
        doc: queueDoc([qItem({ raw: new Array(70001).join('a') })]) },
      { name: 'B04 空（C1形 items が空）', kind: 'c1', expect: ['E04'],
        doc: { _batch: true, items: [] } },
      { name: 'B05 危険スキーム（url が javascript:）', kind: 'c1', expect: ['E05'],
        doc: { _batch: true, items: [{ site: 'shopA', title: 'ボルト', price: 120, url: 'javascript:alert(1)' }] } },
      { name: 'B06 重複id', kind: 'queue', expect: ['E06'],
        doc: queueDoc([qItem(), qItem()]) },
      { name: 'B07 status が列挙外', kind: 'queue', expect: ['E07'],
        doc: queueDoc([qItem({ status: 'done' })]) },
      { name: 'B08 日付異形', kind: 'queue', expect: ['E08'],
        doc: queueDoc([qItem({ capturedAt: '2026/07/19 10:00' })]) },
      { name: 'B09 件数超過（C1形 4件）', kind: 'c1', expect: ['E09'],
        doc: { _batch: true, items: [
          { site: 'a', title: 'x', price: 1 }, { site: 'b', title: 'y', price: 2 },
          { site: 'c', title: 'z', price: 3 }, { site: 'd', title: 'w', price: 4 }] } },
      { name: 'B10 未知source', kind: 'queue', expect: ['E10'],
        doc: queueDoc([qItem({ source: 'telepathy' })]) },
      { name: 'B11 未知type（2026-07-19 追補・E23）', kind: 'queue', expect: ['E23'],
        doc: queueDoc([qItem({ type: 'voice_memo' })]) }
    ];

    var base2 = queueDoc([ qItem({ id: 'gp-A', status: 'exported' }), qItem({ id: 'gp-B', status: 'raw' }) ]);
    var diffs = [
      { name: 'D20 項目消失', expect: ['E20'], opts: {},
        old: base2, 'new': queueDoc([ qItem({ id: 'gp-A', status: 'exported' }) ]) },
      { name: 'D20b 項目消失・--allow-delete で許容', expect: [], opts: { allowDelete: true },
        old: base2, 'new': queueDoc([ qItem({ id: 'gp-A', status: 'exported' }) ]) },
      { name: 'D21 status後退（exported→raw）', expect: ['E21'], opts: {},
        old: base2, 'new': queueDoc([ qItem({ id: 'gp-A', status: 'raw' }), qItem({ id: 'gp-B', status: 'raw' }) ]) },
      { name: 'D22 既存項目の改変（raw が変わった）', expect: ['E22'], opts: {},
        old: base2, 'new': queueDoc([ qItem({ id: 'gp-A', status: 'exported', raw: 'あとから かきかえた' }),
                                      qItem({ id: 'gp-B', status: 'raw' }) ]) }
    ];

    return { good: good, bad: bad, diffs: diffs };
  }

  function sortedUnique(a) {
    var out = [], i;
    for (i = 0; i < a.length; i++) if (out.indexOf(a[i]) < 0) out.push(a[i]);
    return out.sort();
  }

  function selfTest(opts) {
    opts = opts || {};
    var inject = opts.inject || 0;   /* H2: n番目の異形の期待コードを故意に壊す */
    var fx = fixtures();
    var cases = [], pass = 0, fail = 0, i;

    fx.good.forEach(function (g) {
      var r = verify(JSON.stringify(g.doc), g.kind);
      var ok = r.ok;
      cases.push({ name: g.name, group: 'good', expected: [], actual: sortedUnique(r.codes), pass: ok,
                   detail: format(r) });
      ok ? pass++ : fail++;
    });

    for (i = 0; i < fx.bad.length; i++) {
      var b = fx.bad[i];
      var expected = b.expect.slice();
      if (inject === i + 1) expected = expected.concat(['E99']);  /* 変異注入 */
      var rb = verify(JSON.stringify(b.doc), b.kind);
      var actual = sortedUnique(rb.codes);
      var okb = (actual.join(',') === sortedUnique(expected).join(',')) && !rb.ok;
      cases.push({ name: b.name, group: 'bad', expected: sortedUnique(expected), actual: actual, pass: okb,
                   detail: format(rb) });
      okb ? pass++ : fail++;
    }

    fx.diffs.forEach(function (d) {
      var rd = diff(JSON.stringify(d.old), JSON.stringify(d['new']), { kind: 'queue', allowDelete: !!d.opts.allowDelete });
      var actual = sortedUnique(rd.codes);
      var okd = actual.join(',') === sortedUnique(d.expect).join(',');
      cases.push({ name: d.name, group: 'diff', expected: sortedUnique(d.expect), actual: actual, pass: okd,
                   detail: format(rd) });
      okd ? pass++ : fail++;
    });

    /* E00（判定不能）を合格と言わないことの自己確認 */
    var rz = verify('{"a":', 'queue');
    var okz = (!rz.ok && rz.undetermined && rz.codes.join(',') === 'E00');
    cases.push({ name: 'Z00 壊れたJSON → E00・判定不能', group: 'bad', expected: ['E00'],
                 actual: sortedUnique(rz.codes), pass: okz, detail: format(rz) });
    okz ? pass++ : fail++;

    return { ok: fail === 0, schemasVersion: SCHEMAS_VERSION, passCount: pass, failCount: fail,
             goodCount: fx.good.length, badCount: fx.bad.length, diffCount: fx.diffs.length, cases: cases };
  }

  /* ---------- [部2] 公開 ---------- */
  root.BusVerify = {
    SCHEMAS_VERSION: SCHEMAS_VERSION,
    CODES: CODES,
    verify: verify,
    verifyText: verifyText,
    diff: diff,
    format: format,
    selfTest: selfTest,
    fixtures: fixtures
  };

  /* ---------- [部3] CLIガード（node で直接実行された時だけ動く） ---------- */

  function usage(msg) {
    var L = [];
    if (msg) L.push('エラー: ' + msg);
    L.push('つかいかた:');
    L.push('  node ' + SCRIPT_NAME + ' <file.json> --kind c1|queue|export');
    L.push('  node ' + SCRIPT_NAME + ' --selftest [--inject N]');
    L.push('  node ' + SCRIPT_NAME + ' --diff <旧.json> <新.json> [--kind queue] [--allow-delete]');
    L.push('exit: 0=PASS / 1=FAIL / 2=つかいかたが ちがう');
    return L.join('\n');
  }

  function readArg(argv, name) {
    var i = argv.indexOf(name);
    return (i >= 0 && i + 1 < argv.length) ? argv[i + 1] : null;
  }

  function printResult(res, label) {
    var lines = format(res);
    console.log('# ' + label + ' (schemas ' + res.schemasVersion + ')');
    if (res.undetermined) console.log('# 判定不能: 中身を よめなかったので 合格とは いえません');
    if (lines.length === 0) console.log('PASS  もんだいは みつかりませんでした');
    lines.forEach(function (l) { console.log(l); });
    var e = res.errors.length, w = res.warnings.length;
    console.log('# けっか: ' + (res.ok ? 'PASS' : 'FAIL') + '  エラー' + e + 'けん / けいこく' + w + 'けん');
  }

  function main(argv) {
    var fs;
    try { fs = require('fs'); } catch (e) { console.error('fs が つかえません'); return 2; }

    if (argv.length === 0) { console.log(usage()); return 2; }

    /* --selftest */
    if (argv.indexOf('--selftest') >= 0) {
      var inj = parseInt(readArg(argv, '--inject') || '0', 10) || 0;
      var st = selfTest({ inject: inj });
      console.log('# selftest (schemas ' + st.schemasVersion + ')  正形' + st.goodCount +
                  '件 / 異形' + st.badCount + '件 / diff' + st.diffCount + '件 + E00 1件');
      st.cases.forEach(function (c) {
        console.log((c.pass ? 'ok   ' : 'NG   ') + c.name +
                    '  expected=[' + c.expected.join(',') + '] actual=[' + c.actual.join(',') + ']');
        if (!c.pass) c.detail.forEach(function (d) { console.log('       | ' + d); });
      });
      console.log('# けっか: ' + (st.ok ? 'PASS' : 'FAIL') + '  ' + st.passCount + '/' +
                  (st.passCount + st.failCount) + ' 一致');
      return st.ok ? 0 : 1;
    }

    /* --diff */
    if (argv[0] === '--diff') {
      var oldPath = argv[1], newPath = argv[2];
      if (!oldPath || !newPath || oldPath.indexOf('--') === 0 || newPath.indexOf('--') === 0) {
        console.log(usage('--diff には ふるいファイルと あたらしいファイルの 2つが いります')); return 2;
      }
      var kindD = readArg(argv, '--kind') || 'queue';
      if (KIND_LIST.indexOf(kindD) < 0) { console.log(usage('--kind が ちがいます: ' + kindD)); return 2; }
      var to, tn;
      try { to = fs.readFileSync(oldPath, 'utf8'); tn = fs.readFileSync(newPath, 'utf8'); }
      catch (e2) { console.log(usage('ファイルが よめません: ' + e2.message)); return 2; }
      var rd = diff(to, tn, { kind: kindD, allowDelete: argv.indexOf('--allow-delete') >= 0 });
      printResult(rd, 'diff ' + oldPath + ' -> ' + newPath);
      return rd.ok ? 0 : 1;
    }

    /* 1ファイル検査 */
    var file = argv[0];
    if (file.indexOf('--') === 0) { console.log(usage('ファイル名を さいしょに かいてください')); return 2; }
    var kind = readArg(argv, '--kind');
    if (!kind) { console.log(usage('--kind を つけてください')); return 2; }
    if (KIND_LIST.indexOf(kind) < 0) { console.log(usage('--kind が ちがいます: ' + kind)); return 2; }
    var text;
    try { text = fs.readFileSync(file, 'utf8'); }
    catch (e3) { console.log(usage('ファイルが よめません: ' + e3.message)); return 2; }
    var res = verify(text, kind);
    printResult(res, file + ' --kind ' + kind);
    return res.ok ? 0 : 1;
  }

  var isNode = (typeof process !== 'undefined' && process && process.versions && process.versions.node);
  if (isNode) {
    var isMain = false;
    try {
      if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) isMain = true;
    } catch (eg) { /* ESM 文脈では require/module が無い */ }
    if (!isMain && typeof module === 'undefined') {
      /* ESM 文脈の保険: 起動エントリが自分自身なら CLI とみなす */
      var a1 = (process.argv && process.argv[1]) || '';
      if (a1.replace(/\\/g, '/').split('/').pop() === SCRIPT_NAME) isMain = true;
    }
    if (isMain) {
      process.exitCode = main(process.argv.slice(2));
    }
  }

})(typeof globalThis !== 'undefined' ? globalThis : this);

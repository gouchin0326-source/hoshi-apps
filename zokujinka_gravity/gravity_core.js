/*
 * gravity_core.js — 属人化 重心エンジン（純関数モジュール）
 *
 * 実装弾: 知の遺産 W4-Z1
 * 正本設計: HOSHI\knowledge\fable5_legacy\work\LEGACY_ZOKUJINKA_SUMMIT_2026-07-17.md
 *           §Ⅱ2.2（属人度Zの決定論算式）／§Ⅱ2.3（検算fixture）／§Ⅱ2.4（ΔZ）／§C（I/O契約・出力1〜3）
 *
 * 依存ゼロ・副作用なし・DOM非依存。ブラウザ<script>直読み／Node両対応（UMD風エクスポート）。
 * 乱数・LLM・外部API・現在時刻の暗黙依存は使わない（B5=透明性=決定論。時刻は必ず引数/入力JSONから受け取る）。
 * 入力JSONの改変はしない（読み取り専用・B8）。
 *
 * ── 設計書に明記されていた式・閾値（そのまま実装） ─────────────────────────
 *   Z(u,w) = round( 100 × C × A × (1 − G) )                         … §Ⅱ2.2
 *   C = HHI = Σ sᵢ²（sᵢ=窓内更新件数に占める更新者iのシェア）        … §Ⅱ2.2
 *   A = min(1, 窓内更新件数 ÷ 10)                                    … §Ⅱ2.2
 *   G = g1 + g2 + g3（上限1.0）                                      … §Ⅱ2.2
 *     g1 第二走者: 登録≥1名→0.5、無し→0
 *     g2 文書    : 紐付く引き継ぎ資産≥1件→0.25、無し→0
 *     g3 生きた文書: g2の資産に窓内use_log hit≥1→0.25、無し→0
 *   母数不足ガード: 窓内更新件数<3 のユニットはZを出さず「母数不足」    … §Ⅱ2.2
 *   欠損データ規約: 守りデータ未読込なら該当gᵢ=0（エラーにしない）     … §Ⅱ2.2
 *   観測窓 既定90日                                                   … §Ⅱ2.2冒頭
 *   ΔZ = Z(t) − Z(t−1)                                               … §Ⅱ2.4
 *   出力1 gravity.json のユニット項目キー = §C入出力契約の出力1定義通り
 *   出力3 Z履歴のレコード形 = {"t":"…","units":{"<unit>":z}} 通り     … §C出力3
 *
 * ── 設計書に無く、本実装で埋めた箇所（_note＝要司令塔判断の余地として明示） ──
 *   ・「窓内更新件数」と出力キー"files"の区別: updates=観測窓内でmtimeが収まるファイル数、
 *     files=そのユニットに属す全ファイル数（窓外も含む総量）とした。設計書は出力キー名の列挙のみで
 *     両者の定義差は書いていない。§Ⅱ2.2の文言「窓内更新件数」をupdatesに厳密対応させ、files は
 *     ユニット規模の参考値として定義した。
 *   ・守りデータ(スキルマトリクス/教えてログ/use_log)の実ファイルスキーマは本書該当断片に無い
 *     （ユニット↔第二走者数、ユニット↔資産数、という概念のみ記載）。そのため本モジュールでは
 *     集約済みの単純な受け口 guardianData = { units: { "<unit名>": { runners, docs, hits } } } を
 *     アダプタ契約として定義した。実データ(skill_matrix.json等)からこの形へ変換する処理はZ1の外
 *     （Z2/Z4以降 or 司令塔判断）。
 *   ・ユニット判定のpath区切りは"/"想定（既存snapshotの実例に合わせた）。
 */

;(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.GravityCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 観測窓の既定日数（§Ⅱ2.2冒頭）
  var WINDOW_DAYS_DEFAULT = 90;
  // 母数不足ガードの閾値（§Ⅱ2.2「窓内更新件数<3」）
  var MIN_UPDATES_FOR_Z = 3;

  /**
   * HHI（集中度C）を計算する。
   * @param {Object|Array} counts - {更新者名: 件数, ...} または件数の配列
   * @returns {number|null} HHI（0,1]。総数0ならnull（計算不能）
   */
  function computeHHI(counts) {
    var values = Array.isArray(counts) ? counts.slice() : Object.keys(counts).map(function (k) {
      return counts[k];
    });
    var total = values.reduce(function (a, b) { return a + b; }, 0);
    if (total <= 0) return null;
    var hhi = 0;
    for (var i = 0; i < values.length; i++) {
      var s = values[i] / total;
      hhi += s * s;
    }
    return hhi;
  }

  /**
   * 活性Aを計算する。
   * @param {number} updates - 窓内更新件数
   * @returns {number}
   */
  function computeA(updates) {
    return Math.min(1, updates / 10);
  }

  /**
   * 守り点Gを計算する（g1+g2+g3、上限1.0）。
   * @param {Object|null} guard - { runners, docs, hits } いずれも欠損なら0扱い
   * @returns {{g1:number, g2:number, g3:number, G:number}}
   */
  function computeG(guard) {
    var runners = guard && typeof guard.runners === 'number' ? guard.runners : 0;
    var docs = guard && typeof guard.docs === 'number' ? guard.docs : 0;
    var hits = guard && typeof guard.hits === 'number' ? guard.hits : 0;
    var g1 = runners >= 1 ? 0.5 : 0;
    var g2 = docs >= 1 ? 0.25 : 0;
    var g3 = docs >= 1 && hits >= 1 ? 0.25 : 0; // g3はg2の資産にhitがある場合のみ（§Ⅱ2.2表の記述通り）
    var G = Math.min(1.0, g1 + g2 + g3);
    return { g1: g1, g2: g2, g3: g3, G: G };
  }

  /**
   * 属人度Zを計算する。
   * @param {number|null} C - HHI
   * @param {number} A - 活性
   * @param {number} G - 守り点
   * @returns {number|null} 0〜100の整数。Cがnullなら計算不能でnull
   */
  function computeZ(C, A, G) {
    if (C === null || C === undefined) return null;
    return Math.round(100 * C * A * (1 - G));
  }

  /**
   * pathから業務ユニット名を決定する（§Ⅱ2.2「業務ユニットの定義」）。
   * mapping.json（{"map":[{"prefix":"…","unit":"…"}], "v":1}）があれば前方一致で上書き。
   * 無ければpath第一階層（"/"区切りの先頭）をユニット名とする。
   * @param {string} path
   * @param {Object|null} mapping
   * @returns {string}
   */
  function resolveUnit(path, mapping) {
    if (mapping && Array.isArray(mapping.map)) {
      for (var i = 0; i < mapping.map.length; i++) {
        var entry = mapping.map[i];
        if (entry && typeof entry.prefix === 'string' && path.indexOf(entry.prefix) === 0) {
          return entry.unit;
        }
      }
    }
    var idx = path.indexOf('/');
    return idx === -1 ? path : path.slice(0, idx);
  }

  /**
   * mtimeが観測窓内（refTimeMsを終端としwindowDays遡った範囲）に入るか判定する。
   * @param {string} mtimeISO
   * @param {number} refTimeMs
   * @param {number} windowDays
   * @returns {boolean}
   */
  function withinWindow(mtimeISO, refTimeMs, windowDays) {
    var t = Date.parse(mtimeISO);
    if (isNaN(t)) return false;
    var windowStartMs = refTimeMs - windowDays * 86400000;
    return t >= windowStartMs && t <= refTimeMs;
  }

  /**
   * 属人度Z一式（gravity.json相当のオブジェクト）を構築する。読み取り専用・副作用なし。
   * @param {Object} snapshot - 入力1 { root, scanned_at, files:[{path,ext,size,mtime,who}] }
   * @param {Object|null} guardianData - 守りデータのアダプタ形 { units: { "<unit>": {runners,docs,hits} } }（無ければnull可＝欠損データ規約）
   * @param {Object|null} mapping - 入力3 { map:[{prefix,unit}], v:1}（無ければnull可）
   * @param {Object} [options]
   * @param {number} [options.windowDays=90]
   * @param {string} [options.computedAt] - 未指定ならISO文字列で現在時刻（呼び出し側が固定して渡すのがテスト時の作法）
   * @returns {Object} 出力1 gravity.json相当 { v, window_days, computed_at, units:[...] }
   */
  function buildGravity(snapshot, guardianData, mapping, options) {
    options = options || {};
    var windowDays = typeof options.windowDays === 'number' ? options.windowDays : WINDOW_DAYS_DEFAULT;
    var computedAt = options.computedAt || new Date().toISOString();
    var files = (snapshot && Array.isArray(snapshot.files)) ? snapshot.files : [];
    var refTimeMs = (snapshot && snapshot.scanned_at) ? Date.parse(snapshot.scanned_at) : Date.now();

    // ユニットごとに集計（入力を書き換えない＝B8）
    var unitsBucket = {};
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f || typeof f.path !== 'string') continue;
      var unit = resolveUnit(f.path, mapping);
      if (!unitsBucket[unit]) unitsBucket[unit] = { allFiles: [], windowFiles: [] };
      unitsBucket[unit].allFiles.push(f);
      if (withinWindow(f.mtime, refTimeMs, windowDays)) {
        unitsBucket[unit].windowFiles.push(f);
      }
    }

    var guardUnits = (guardianData && guardianData.units) || {};

    var unitNames = Object.keys(unitsBucket).sort();
    var units = unitNames.map(function (unitName) {
      var bucket = unitsBucket[unitName];
      var updates = bucket.windowFiles.length;
      var filesTotal = bucket.allFiles.length;

      // 母数不足ガード（§Ⅱ2.2）
      if (updates < MIN_UPDATES_FOR_Z) {
        return {
          unit: unitName, z: null, c: null, a: null, g: null,
          updates: updates, files: filesTotal,
          top_who: null, top_share: null,
          runners: 0, docs: 0, hits: 0,
          verdict: 'insufficient'
        };
      }

      // whoデータの有無を確認（欠損データ規約・W-4「だれデータ無し」縮退）
      var whoCounts = {};
      var whoKnownCount = 0;
      for (var j = 0; j < bucket.windowFiles.length; j++) {
        var who = bucket.windowFiles[j].who;
        if (who === undefined || who === null || who === '') continue;
        whoKnownCount++;
        whoCounts[who] = (whoCounts[who] || 0) + 1;
      }

      if (whoKnownCount === 0) {
        return {
          unit: unitName, z: null, c: null, a: computeA(updates), g: null,
          updates: updates, files: filesTotal,
          top_who: null, top_share: null,
          runners: 0, docs: 0, hits: 0,
          verdict: 'no_who'
        };
      }

      var C = computeHHI(whoCounts);
      var A = computeA(updates);
      var guard = guardUnits[unitName] || null;
      var gResult = computeG(guard);
      var Z = computeZ(C, A, gResult.G);

      var topWho = null, topShare = 0;
      for (var w in whoCounts) {
        if (!Object.prototype.hasOwnProperty.call(whoCounts, w)) continue;
        var share = whoCounts[w] / whoKnownCount;
        if (share > topShare) { topShare = share; topWho = w; }
      }

      return {
        unit: unitName, z: Z, c: C, a: A, g: gResult.G,
        updates: updates, files: filesTotal,
        top_who: topWho, top_share: topShare,
        runners: (guard && guard.runners) || 0,
        docs: (guard && guard.docs) || 0,
        hits: (guard && guard.hits) || 0,
        verdict: 'ok'
      };
    });

    return {
      v: 1,
      window_days: windowDays,
      computed_at: computedAt,
      units: units
    };
  }

  /**
   * ΔZ = Z(t) − Z(t−1) を計算する（§Ⅱ2.4）。片方でもZが無ければnull（比較不能）。
   * @param {number|null} zCurrent
   * @param {number|null} zPrevious
   * @returns {number|null}
   */
  function computeDeltaZ(zCurrent, zPrevious) {
    if (typeof zCurrent !== 'number' || typeof zPrevious !== 'number') return null;
    return zCurrent - zPrevious;
  }

  /**
   * gravity.jsonからユニット名→Zのマップを抜き出す（Z履歴レコード生成の下準備）。
   * @param {Object} gravityJson
   * @returns {Object} { "<unit>": z|null }
   */
  function extractZMap(gravityJson) {
    var map = {};
    if (gravityJson && Array.isArray(gravityJson.units)) {
      for (var i = 0; i < gravityJson.units.length; i++) {
        var u = gravityJson.units[i];
        map[u.unit] = (typeof u.z === 'number') ? u.z : null;
      }
    }
    return map;
  }

  /**
   * 出力3 Z履歴（gravity_history.json）に1レコード追記した新しい配列を返す（元配列は変更しない）。
   * @param {Array} history - 既存の履歴配列（無ければ空配列扱い）
   * @param {Object} gravityJson - buildGravityの戻り値
   * @param {string} [timestamp] - 未指定ならgravityJson.computed_atを使う
   * @returns {Array} 追記後の新しい履歴配列
   */
  function appendHistory(history, gravityJson, timestamp) {
    var list = Array.isArray(history) ? history.slice() : [];
    var t = timestamp || (gravityJson && gravityJson.computed_at) || new Date().toISOString();
    list.push({ t: t, units: extractZMap(gravityJson) });
    return list;
  }

  /**
   * 2時点のZマップからユニットごとのΔZを一括計算する。
   * @param {Object} prevZMap - { "<unit>": z|null }
   * @param {Object} currZMap - { "<unit>": z|null }
   * @returns {Object} { "<unit>": deltaZ|null }
   */
  function computeDeltaZForUnits(prevZMap, currZMap) {
    prevZMap = prevZMap || {};
    currZMap = currZMap || {};
    var unitSet = {};
    Object.keys(prevZMap).forEach(function (k) { unitSet[k] = true; });
    Object.keys(currZMap).forEach(function (k) { unitSet[k] = true; });
    var result = {};
    Object.keys(unitSet).forEach(function (u) {
      var prev = Object.prototype.hasOwnProperty.call(prevZMap, u) ? prevZMap[u] : null;
      var curr = Object.prototype.hasOwnProperty.call(currZMap, u) ? currZMap[u] : null;
      result[u] = computeDeltaZ(curr, prev);
    });
    return result;
  }

  return {
    WINDOW_DAYS_DEFAULT: WINDOW_DAYS_DEFAULT,
    MIN_UPDATES_FOR_Z: MIN_UPDATES_FOR_Z,
    computeHHI: computeHHI,
    computeA: computeA,
    computeG: computeG,
    computeZ: computeZ,
    resolveUnit: resolveUnit,
    withinWindow: withinWindow,
    buildGravity: buildGravity,
    computeDeltaZ: computeDeltaZ,
    extractZMap: extractZMap,
    appendHistory: appendHistory,
    computeDeltaZForUnits: computeDeltaZForUnits
  };
}));

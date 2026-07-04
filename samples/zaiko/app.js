// AUTO-GENERATED deterministic crud_csv app (no LLM; schema fully determines behavior)
(function () {
  var STORAGE_KEY = "inventory_management";
  var FIELDS = [{"key": "product_name", "label": "商品名", "type": "text"}, {"key": "stock_quantity", "label": "在庫数", "type": "number"}];
  var HEADER = "商品名,在庫数";
  var TOTAL_FIELD = "stock_quantity";
  var records = [];
  try { var raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (Array.isArray(raw)) records = raw; } catch (e) { records = []; }

  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }

  window.__getAll = function () { return records.slice(); };
  window.__add = function (record) { records.push(record); save(); render(); return records.length; };
  window.__remove = function (index) { if (index >= 0 && index < records.length) { records.splice(index, 1); save(); render(); } };
  window.__exportCSV = function () {
    var lines = [HEADER];
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      lines.push(FIELDS.map(function (f) { var v = r[f.key]; return v == null ? '' : String(v); }).join(','));
    }
    return lines.join('\n');
  };
  window.__total = function () { return records.reduce(function (s, r) {
    return s + (Number(r[TOTAL_FIELD]) || 0); }, 0); };

  function render() {
    var list = document.querySelector('#recList');
    if (list) {
      var isTable = list.tagName === 'TBODY';
      list.innerHTML = '';
      if (records.length === 0) {
        var em = document.createElement(isTable ? 'tr' : 'li');
        em.className = 'muted'; em.textContent = 'まだ項目がありません';
        list.appendChild(em);
      }
      records.forEach(function (r, i) {
        var text = FIELDS.map(function (f) { return f.label + ': ' + (r[f.key] == null ? '' : r[f.key]); }).join(' / ');
        var del = document.createElement('button');
        del.className = 'btn danger'; del.textContent = '削除';
        del.addEventListener('click', function () { window.__remove(i); });
        var row;
        if (isTable) {
          row = document.createElement('tr');
          var td1 = document.createElement('td'); td1.textContent = text; row.appendChild(td1);
          var td2 = document.createElement('td'); td2.appendChild(del); row.appendChild(td2);
        } else {
          row = document.createElement('li');
          var span = document.createElement('span'); span.textContent = text + ' '; row.appendChild(span);
          row.appendChild(del);
        }
        list.appendChild(row);
      });
    }
    var totalEl = document.querySelector('#recTotal');
    if (totalEl) { totalEl.textContent = '合計: ' + window.__total(); }
  }

  function readInputs() {
    var rec = {};
    FIELDS.forEach(function (f) {
      var el = document.querySelector('#f_' + f.key);
      var v = el ? el.value : '';
      if (f.type === 'number') v = (v === '' || v == null) ? 0 : Number(v);
      rec[f.key] = v;
    });
    return rec;
  }

  function wire() {
    var addBtn = document.querySelector('#addBtn');
    if (addBtn) addBtn.addEventListener('click', function () {
      var hasAny = FIELDS.some(function (f) { var el = document.querySelector('#f_' + f.key); return el && String(el.value).trim() !== ''; });
      if (!hasAny) return;
      window.__add(readInputs());
      FIELDS.forEach(function (f) { var el = document.querySelector('#f_' + f.key); if (el) el.value = ''; });
    });
    var exportBtn = document.querySelector('#exportBtn');
    if (exportBtn) exportBtn.addEventListener('click', function () {
      var csv = window.__exportCSV();
      try {
        var blob = new Blob([csv], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = STORAGE_KEY + '.csv';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      } catch (e) {}
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

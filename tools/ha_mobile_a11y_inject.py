"""業務支援アプリ(apps.json biz=業務支援)のindex.htmlへ、スマホ向け操作性CSSを冪等に注入する。
- 入力欄の文字が16px未満なら16pxへ引上げ（iOSのフォーカス時ズーム防止・大きい指定は維持）
- ボタン/入力の最小高さ44px（押し間違い防止）
使い方: python ha_mobile_a11y_inject.py <repo_dir> [--remove]"""
import sys, json, re, pathlib
repo = pathlib.Path(sys.argv[1]); remove = "--remove" in sys.argv
SKIP = {"seisan_board_3d"}  # canvas主体の3D表示は対象外
MARK_S, MARK_E = "<!-- ha-mobile-a11y:start -->", "<!-- ha-mobile-a11y:end -->"
CSS = MARK_S + """<style id="ha-mobile-a11y">
@media (max-width:600px),(pointer:coarse){
 input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),select,textarea{min-height:44px;box-sizing:border-box}
 button,input[type=button],input[type=submit],input[type=reset],[role=button]{min-height:44px}
 input[type=checkbox],input[type=radio]{min-width:22px;min-height:22px}
}
</style><script>/* 入力欄の文字が16px未満の時だけ16pxへ引上げ（iOSのフォーカス時ズーム防止）。大きい指定は維持 */
(function(){if(!matchMedia("(max-width:600px),(pointer:coarse)").matches)return;var Q="input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),select,textarea";
function fix(r){(r.querySelectorAll?r:document).querySelectorAll(Q).forEach(function(e){if(parseFloat(getComputedStyle(e).fontSize)<16)e.style.setProperty("font-size","16px","important")})}
var t;function run(){clearTimeout(t);t=setTimeout(function(){fix(document)},60)}
document.addEventListener("DOMContentLoaded",function(){fix(document);new MutationObserver(run).observe(document.body,{childList:true,subtree:true})})})();
</script>""" + MARK_E
def head_close(html):
    """<script>…</script>内（インラインJSの文字列）を除外して最初の</head>位置を返す（元文字列上の位置）"""
    tok = re.compile(r"<script\b|</head\s*>", re.I); pos = 0
    while True:
        m = tok.search(html, pos)
        if not m: return -1
        if m.group(0).lower().startswith("</head"): return m.start()
        e = re.compile(r"</script\s*>", re.I).search(html, m.end())
        if not e: return -1
        pos = e.end()
apps = json.loads((repo / "apps.json").read_text(encoding="utf-8"))["apps"]
done = []
for a in apps:
    p = a["path"]
    if a.get("biz") != "業務支援" or not p.endswith("/") or p.strip("/") in SKIP: continue
    f = repo / p / "index.html"
    if not f.exists(): continue
    s = f.read_text(encoding="utf-8")
    s2 = re.sub(re.escape(MARK_S) + ".*?" + re.escape(MARK_E) + r"\n?", "", s, flags=re.S)
    if not remove:
        i = head_close(s2)
        if i < 0: print("no </head>:", f); continue
        s2 = s2[:i] + CSS + "\n" + s2[i:]
    if s2 != s: f.write_text(s2, encoding="utf-8"); done.append(p)
print(len(done), "files updated")

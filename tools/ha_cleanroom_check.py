"""hoshi-appsの全HTMLを素の環境で375px/1280pxで開き機械判定する(AI呼出0)。使い方: python ha_cleanroom_check.py <repo_dir> <out_dir>"""
import os, sys, json, time, threading, functools, http.server, socketserver, pathlib
from playwright.sync_api import sync_playwright

repo = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)
pages = sorted(p.relative_to(repo).as_posix() for p in repo.rglob("*.html") if ".git" not in p.parts)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Q, directory=str(repo))
srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
JS = r"""() => {
 const de=document.documentElement, vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};
 let small=0, tiny=0, tap=0;
 document.querySelectorAll('a,button,input,select,textarea,[role=button],[onclick]').forEach(e=>{if(!vis(e))return;const r=e.getBoundingClientRect();if(e.type==='hidden')return;if(r.width<44||r.height<44)tap++;});
 const w=document.createTreeWalker(document.body||de,NodeFilter.SHOW_TEXT);let n;
 while(n=w.nextNode()){if(!n.textContent.trim())continue;const e=n.parentElement;if(!e||!vis(e))continue;const f=parseFloat(getComputedStyle(e).fontSize);if(f<12.5)tiny++;else if(f<16)small++;}
 return {hscroll: de.scrollWidth>de.clientWidth+1, sw:de.scrollWidth, cw:de.clientWidth, tap_lt44:tap, font_lt16:small, font_lt12_5:tiny};
}"""
res, t0 = [], time.time()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    for vw, vh in ((375, 812), (1280, 800)):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, service_workers="block")
        for pg in pages:
            page = ctx.new_page(); errs = []
            page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
            page.on("pageerror", lambda e: errs.append(("pageerror: " + str(e))[:160]))
            r = {"page": pg, "w": vw}
            try:
                page.goto(f"http://127.0.0.1:{port}/{pg}", wait_until="load", timeout=15000); page.wait_for_timeout(800)
                r.update(page.evaluate(JS))
            except Exception as e:
                r["fail"] = str(e)[:160]
            r["errors"] = errs[:5]; r["n_err"] = len(errs); res.append(r); page.close()
        ctx.close()
    b.close()
srv.shutdown()
bad = [r for r in res if r.get("fail") or r.get("hscroll") or r["n_err"]]
summary = {"pages": len(pages), "runs": len(res), "sec": round(time.time() - t0, 1),
           "fail": sum(1 for r in res if r.get("fail")), "hscroll": sum(1 for r in res if r.get("hscroll")),
           "console_err_pages": sum(1 for r in res if r["n_err"]), "tap_lt44_total": sum(r.get("tap_lt44", 0) for r in res),
           "font_lt12_5_total": sum(r.get("font_lt12_5", 0) for r in res)}
(out / "report.json").write_text(json.dumps({"summary": summary, "results": res}, ensure_ascii=False, indent=1), encoding="utf-8")
lines = ["# 検分結果", "```", json.dumps(summary, ensure_ascii=False), "```", "## 横スクロール/エラー/開けない (上位40)"]
lines += [f"- {r['page']} @{r['w']}: " + ", ".join(x for x in [("開けない " + r['fail']) if r.get('fail') else "", f"横スクロール {r.get('sw')}>{r.get('cw')}" if r.get('hscroll') else "", f"エラー{r['n_err']} {r['errors'][:1]}" if r['n_err'] else ""] if x) for r in bad[:40]]
(out / "summary.md").write_text("\n".join(lines), encoding="utf-8")
print(json.dumps(summary, ensure_ascii=False))

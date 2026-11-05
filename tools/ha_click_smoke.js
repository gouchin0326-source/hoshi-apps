// 全業務アプリで「入力→ボタン全押し」を行い、JSエラー(pageerror)を拾う操作検分。AI呼出0。
// 使い方: node tools/ha_click_smoke.js <repo_dir> <out.json> [app1,app2,...]
const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(process.argv[2]),out=process.argv[3],only=(process.argv[4]||'').split(',').filter(Boolean);
const apps=JSON.parse(fs.readFileSync(path.join(root,'apps.json'),'utf8')).apps
  .filter(a=>a.biz==='業務支援'&&a.path.endsWith('/')&&a.path!=='seisan_board_3d/').map(a=>a.path)
  .filter(p=>!only.length||only.includes(p.replace(/\/$/,'')));
const T={html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',json:'application/json',png:'image/png',svg:'image/svg+xml'};
const srv=http.createServer((q,r)=>{let f;try{f=path.resolve(root,'.'+path.posix.normalize('/'+decodeURIComponent(q.url.split('?')[0])));}catch(_){r.writeHead(400);return r.end()}if(f!==root&&!f.startsWith(root+path.sep)){r.writeHead(403);return r.end()}if(q.url.split('?')[0].endsWith('/'))f=path.join(f,'index.html');fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);return r.end()}r.writeHead(200,{'Content-Type':T[f.split('.').pop()]||'application/octet-stream'});r.end(d)})}).listen(0,'127.0.0.1',async()=>{
  const b=await chromium.launch();const res=[];
  for(const app of apps){
    const c=await b.newContext({viewport:{width:375,height:812},serviceWorkers:'block',acceptDownloads:true});
    const p=await c.newPage();const errs=new Set();
    let phase='op';p.on('pageerror',e=>errs.add((phase==='reload'?'[再読込] ':'')+String(e).slice(0,200)));p.on('dialog',d=>d.accept().catch(()=>{}));
    p.on('popup',pp=>pp.close().catch(()=>{}));
    try{
      await p.goto(`http://127.0.0.1:${srv.address().port}/${app}`,{waitUntil:'load',timeout:15000});await p.waitForTimeout(500);
      // 入力を埋める
      await p.evaluate(()=>{let i=0;document.querySelectorAll('input,textarea,select').forEach(e=>{i++;const t=(e.type||'').toLowerCase();
        if(e.disabled||e.readOnly||t==='file'||t==='hidden')return;
        if(e.tagName==='SELECT'){if(e.options.length>1)e.selectedIndex=1;}
        else if(t==='checkbox'||t==='radio'){e.checked=true;}
        else if(t==='number'||t==='range'){e.value=String(10+i);}
        else if(t==='date'){e.value='2026-11-05';}else if(t==='datetime-local'){e.value='2026-11-05T08:30';}else if(t==='week'){e.value='2026-W45';}else if(t==='email'){e.value='test'+i+'@example.com';}else if(t==='tel'){e.value='0312345678';}else if(t==='url'){e.value='https://example.com/';}else if(t==='time'){e.value='08:30';}else if(t==='month'){e.value='2026-11';}
        else if(t==='color'){e.value='#336699';}else{e.value='テスト'+i;}
        e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));});});
      // ボタンを順に押す（最大60）
      for(let k=0;k<200;k++){
        const ok=await p.evaluate(k=>{const v=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'&&!e.disabled};
          if(k===0){[...document.querySelectorAll('button,input[type=button],input[type=submit],[role=button]')].forEach((e,i)=>e.dataset.smk=i);}
          // 最初に採番した順で押す（モーダル開閉・タブ切替で順番がずれないように）。見えない時は飛ばす
          const e=document.querySelector('[data-smk="'+k+'"]');if(!e)return k<400&&document.querySelectorAll('[data-smk]').length>k;if(!v(e))return true;const t=(e.textContent||e.value||'').trim();
          if(/削除|消去|全消|取り消|リセット|初期化|クリア|🗑|delete|remove|reset|clear/i.test(t))return true;
          try{e.click();}catch(_){ }return true;},k);
        if(!ok)break;await p.waitForTimeout(60);
        if(!p.url().includes(app)){await p.goBack().catch(()=>{});await p.waitForTimeout(300);}
      }
      await p.waitForTimeout(300);
      // 再読込: 保存済みデータでの描画エラーを拾う（データ互換・復元の検分）
      const ls=await p.evaluate(()=>{try{return localStorage.length}catch(e){return -1}});
      errs.add('__LS__'+ls);
      phase='reload';await p.reload({waitUntil:'load'});await p.waitForTimeout(600);
    }catch(e){errs.add('FAIL '+String(e).slice(0,160));}
    {const all=[...errs];const ls=all.find(x=>x.startsWith('__LS__'));res.push({app,ls:ls?+ls.slice(6):null,errors:all.filter(x=>!x.startsWith('__LS__'))});};await c.close();
  }
  await b.close();srv.close();
  fs.writeFileSync(out,JSON.stringify(res,null,1));
  const bad=res.filter(r=>r.errors.length);console.log(`apps ${res.length} / with errors ${bad.length} / localStorage未使用 ${res.filter(r=>r.ls===0).length}`);
  bad.forEach(r=>console.log(r.app,'|',r.errors.slice(0,2).join(' || ')));
});

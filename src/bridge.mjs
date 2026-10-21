// ./bridge — the page's ONE declaration of the view it wants from the DeSciX host, and the bridge file it rides on.
// The declarer follows the SDK template's documented sequence: await DeSciX.ready(), then view.set('CodeSite') only
// when view.available() says the host listens. What happened is recorded on <html data-descix-view>, in the vocabulary
// of @descix/frqtl-web/host-view HOST_VIEW_OUTCOMES (the test runs the script against stub SDKs and holds every
// outcome it records to that table).
import fs from 'node:fs';
import path from 'node:path';
import { refuse } from './html.mjs';
import { importFrom } from './resolve.mjs';

export const CODESITE_SCRIPT = `(async function(){
  var d=document.documentElement, S=window.DeSciX, rec=function(x){d.dataset.descixView=x;};
  if(!S||typeof S.ready!=='function'){rec('sdk-absent');return;}
  rec('pending');
  var r; try{ r=await S.ready(); }catch(e){ rec('embedded-no-bridge'); d.dataset.descixViewDetail='ready() rejected: '+(e&&e.message?e.message:e); return; }
  if(!r||r.mode!=='shell'){ rec(r&&r.mode==='standalone'?'standalone':'embedded-no-bridge'); return; }
  var v=S.view;
  if(!v||typeof v.available!=='function'||typeof v.set!=='function'){ rec('view-unpublished'); return; }
  if(!v.available()){ rec('not-listening'); return; }
  v.set('CodeSite'); rec('requested:CodeSite');
})();`;

/** The generated app-side bridge (@descix/app-sdk/scaffold SITE_SCAFFOLD_BRIDGE, resolved from the app): { name, data }. */
export async function loadBridgeFile(fromDir) {
  let p;
  try { ({ SITE_SCAFFOLD_BRIDGE: p } = await importFrom(fromDir, '@descix/app-sdk/scaffold')); }
  catch (e) { refuse(`@descix/app-sdk is not installed (npm ci): ${e.message}`); }
  if (!p || !fs.existsSync(p)) refuse(`@descix/app-sdk exports no SITE_SCAFFOLD_BRIDGE file: ${p}`);
  const data = fs.readFileSync(p);
  if (!data.toString('utf8').includes('GENERATED FILE')) refuse(`${p} is not the generated DeSciXAppSDK.js`);
  return { name: path.basename(p), data };
}

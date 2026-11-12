// A stub of the page side of the DeSciX App Shell, as the bus behaves (README "Sign-in state"), and a runner that runs a
// built page's scripts in ONE node:vm context whose global is the page's window (so egptSiteAuth, defined by the auth
// watcher, is a global to the scripts after it, as in a browser).
//
// stubBus({ mode, powch, bridgeLevel, signedIn, address, call })
//   mode         ready()'s mode: 'shell' (default), 'standalone', 'embedded-no-bridge'
//   powch        'ready' (default): on the bus at ready(), members name it; 'late': not on the bus at ready(), assigned
//                when arrive() fires DESCX_BRIDGE_READY on the shell's window (bridgeLevel frames up)
//   bridgeLevel  default 1 (the page is framed by the shell)
//   call         (command, params) => value | Promise: DeSciX.call's answer
// Returns { DeSciX, shellWindow, arrive(), auth(state), logins, offs, calls, listening() }.
import vm from 'node:vm';

export function stubBus({ mode = 'shell', powch = 'ready', bridgeLevel = 1, signedIn = false, address = null, call = () => ({}) } = {}) {
  const subs = new Set();
  let state = { signedIn, address };
  const logins = [], offs = [], calls = [];
  const P = {
    login() { logins.push(1); return Promise.resolve(); },
    on(ev, f) {
      if (ev !== 'auth') throw new Error(`stub powch: no event ${ev}`);
      subs.add(f); f({ ...state });
      return () => { offs.push(1); subs.delete(f); };
    },
  };
  const shellListeners = {};
  const shellWindow = { addEventListener(t, f, o) { (shellListeners[t] = shellListeners[t] || []).push({ f, once: !!(o && o.once) }); } };
  const DeSciX = {
    bridgeLevel: mode === 'shell' ? bridgeLevel : -1,
    ready: async () => (mode === 'shell' ? { mode, version: 1, members: powch === 'ready' ? ['view', 'powch'] : ['view'] } : { mode, members: [], version: null }),
    call: async (command, params) => { calls.push({ command, params }); return call(command, params); },
  };
  if (mode === 'shell' && powch === 'ready') DeSciX.powch = P;
  return {
    DeSciX, shellWindow, logins, offs, calls,
    listening: t => (shellListeners[t] || []).length,
    arrive() {
      DeSciX.powch = P;
      const ls = shellListeners.DESCX_BRIDGE_READY || [];
      shellListeners.DESCX_BRIDGE_READY = ls.filter(l => !l.once);
      for (const l of ls) l.f({ type: 'DESCX_BRIDGE_READY' });
    },
    auth(s) { state = s; for (const f of [...subs]) f({ ...s }); },
  };
}

/** Runs scripts (strings) in one context: the global is the window; extra globals (document, sessionStorage) merged. */
export function runScripts(scripts, { bus = null, globals = {} } = {}) {
  const listeners = {}, errors = [];
  const ctx = {
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    console: { error: (...a) => errors.push(a), log() {} },
    Promise, JSON, Object, String, RegExp, Array,
    ...globals,
  };
  ctx.window = ctx;
  if (bus) {
    ctx.DeSciX = bus.DeSciX;
    // the frame chain: the page's parent is the shell's window at bridgeLevel 1; deeper levels chain plain frames
    let w = ctx;
    for (let i = 0; i < Math.max(bus.DeSciX.bridgeLevel, 0); i++) { const up = i === bus.DeSciX.bridgeLevel - 1 ? bus.shellWindow : { addEventListener() { throw new Error('stub: listener on a frame that is not the shell'); } }; w.parent = up; w = up; }
  }
  vm.createContext(ctx);
  for (const js of scripts) vm.runInContext(js, ctx);
  return { ctx, listeners, errors, fire: (t, e) => (listeners[t] || []).forEach(f => f(e)) };
}

export const settle = () => new Promise(r => setImmediate(r));

/** The auth watcher's script on a built page, or null. */
export const authScriptOf = html => (html.match(/<script>\n(\(function\(\)\{\n  \/\/ The theme's auth watcher[\s\S]*?)\n<\/script>/) || [null, null])[1];

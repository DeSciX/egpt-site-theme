(function(){
  // The theme's auth watcher: the ONE reader of the shell's sign-in state on the page. The login button's script and the
  // proposal forms' script both consume it through egptSiteAuth.watch(cb); neither reads DeSciX.powch's state itself.
  // cb gets {shell, powch, signedIn, address}: at once with the current state when there is one, then on every change.
  //   shell   false: no DeSciX App Shell above the page (ready() mode is not 'shell'), or no bridge on the page.
  //   powch   true once DeSciX.powch is on the shell's bus: at ready() when its members name it, else when the shell
  //           fires DESCX_BRIDGE_READY on the shell's window (DeSciX.bridgeLevel frames up).
  //   signedIn, address: from DeSciX.powch.on('auth'), which calls back at once with the current state, then on each
  //           change; the subscription is dropped when the page goes.
  // A rejected DeSciX.ready() (or a throw while subscribing) fails loud: the error is logged, the page shows the
  // auth.fail line at the top of the body (role=alert), and cb gets {shell:false, powch:false, signedIn:false,
  // address:null, error:<message>}.
  var A={{auth:config}};
  var subs=[],cur=null;
  function set(s){cur=s;for(var i=0;i<subs.length;i++)subs[i](s);}
  window.egptSiteAuth={watch:function(cb){subs.push(cb);if(cur)cb(cur);}};
  var OUT={shell:false,powch:false,signedIn:false,address:null};
  if(!(window.DeSciX&&typeof DeSciX.ready==='function')){set(OUT);return;}
  function fail(e){
    var msg=String(e&&e.message?e.message:e);
    console.error('[egpt-site-theme] sign-in is unavailable: DeSciX.ready() failed:',e);
    var n=document.createElement('p');n.id='egpt-auth-fail';n.setAttribute('role','alert');
    n.style.cssText='margin:0;padding:12px 20px;background:var(--panel);border-bottom:1px solid var(--gold);color:var(--gold);font-family:var(--mono);font-size:13px';
    n.textContent=A.fail+' ('+msg+')';document.body.insertBefore(n,document.body.firstChild);
    set({shell:false,powch:false,signedIn:false,address:null,error:msg});
  }
  DeSciX.ready().then(function(r){
    if(r.mode!=='shell'){set(OUT);return;}
    set({shell:true,powch:false,signedIn:false,address:null});
    function start(){
      var off=DeSciX.powch.on('auth',function(a){set({shell:true,powch:true,signedIn:!!a.signedIn,address:a.address||null});});
      addEventListener('pagehide',function(e){if(!e.persisted)off();});
    }
    if(r.members.indexOf('powch')>=0) start();
    else{var w=window;for(var i=0;i<DeSciX.bridgeLevel;i++)w=w.parent;w.addEventListener('DESCX_BRIDGE_READY',start,{once:true});}
  }).then(null,fail);
})();

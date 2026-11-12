(function(){
  // The proposal forms (#licence-form, #proposal-form): each sends ONE record to DeSciX's proposal intake, from a
  // signed-in visitor, through the shell's bus: DeSciX.call(C.command, {app_id, kb_id, records: [record]}). C is
  // written by the builder from ./request (the fields, the kinds, the intake, the lines). Signed out, the button reads
  // C.lines.signin and opens Powch; what was typed is kept in sessionStorage and put back after the sign-in. The sign-in
  // state is the theme's auth watcher's (egptSiteAuth). The bus answers a send by resolving the whole envelope
  // {status, auth_status, message: <receipt>}, whose receipt names the record by the one key of
  // message.content_sha256_by_file_id, or by rejecting with {code, message, status, data}: a code in C.refusals shows
  // its line beside the form; the shell's signed-out refusal (C.signed_out, no code) shows the sign-in line; any other
  // rejection shows the form's fail line. Every rejection is logged. Never a silent failure.
  var C={{request:config}};
  var state={shell:false,powch:false,signedIn:false};
  var forms=[];
  function el(id){return document.getElementById(id);}
  function store(){try{return window.sessionStorage;}catch(e){return null;}}
  function keep(f,id,cfg){
    var s=store(); if(!s) return;
    var v={}; cfg.fields.forEach(function(x){v[x.name]=f.elements[x.name].value;});
    try{s.setItem(C.store+':'+id,JSON.stringify(v));}catch(e){}
  }
  function restore(f,id,cfg){
    var s=store(),v=null; if(!s) return;
    try{v=JSON.parse(s.getItem(C.store+':'+id)||'null');}catch(e){v=null;}
    if(!v) return;
    cfg.fields.forEach(function(x){if(typeof v[x.name]==='string'&&v[x.name]) f.elements[x.name].value=v[x.name];});
  }
  function drop(id){var s=store(); if(s) try{s.removeItem(C.store+':'+id);}catch(e){}}
  function label(f){
    var b=f.querySelector('button[type=submit]');
    if(!b.hasAttribute('data-send')) b.setAttribute('data-send',b.textContent);
    b.textContent=state.signedIn?b.getAttribute('data-send'):C.lines.signin;
    b.disabled=false;
  }
  function labels(){forms.forEach(function(x){label(x.f);});}
  // A rejection's code: err.code, read as a property (the error comes from the shell's window, so it is never an
  // instanceof this frame's Error).
  function codeOf(x){return x!=null&&typeof x.code==='string'&&x.code?x.code:null;}
  // the control a PROPOSAL_FIELD_INVALID names in err.data.field: its record field (extra.<name> for an extra) or its name
  function fieldOf(x,cfg){
    var t=x.data&&x.data.field; if(typeof t!=='string') return null;
    for(var i=0;i<cfg.fields.length;i++){
      var fx=cfg.fields[i];
      if(t===(fx.record===C.extra?C.extra+'.'+fx.name:fx.record)||t===fx.name) return fx;
    }
    return null;
  }
  // the record id: the one key of the receipt's content_sha256_by_file_id, else null (the plain done panel)
  function idOf(r){
    var m=r!=null&&typeof r==='object'&&r.message!=null&&typeof r.message==='object'?r.message.content_sha256_by_file_id:undefined;
    var k=m!=null&&typeof m==='object'?Object.keys(m):[];
    if(k.length!==1) console.error('proposal sent, but the answer names no one record (message.content_sha256_by_file_id):',r);
    return k.length===1?k[0]:null;
  }
  function recordOf(f,cfg){
    var r={type:C.type,kind:cfg.kind,page_url:C.page_url},extra={},n=0;
    cfg.fields.forEach(function(x){
      var v=String(f.elements[x.name].value||'').trim(); if(!v) return;
      if(x.record===C.extra){extra[x.name]=v;n++;} else r[x.record]=v;
    });
    if(n) r[C.extra]=extra;
    return r;
  }
  function wire(id,cfg){
    var f=el(id); if(!f) return;
    var P=cfg.parts,err=el(P.err),fail=el(P.fail),refused=el(P.refused),done=el(P.done);
    forms.push({f:f,id:id});
    restore(f,id,cfg);
    // an edit keeps the typing and clears the edited control's refusal mark
    function edited(e){keep(f,id,cfg);var t=e&&e.target;if(t&&t.removeAttribute)t.removeAttribute('aria-invalid');}
    f.addEventListener('input',edited);
    f.addEventListener('change',edited);
    function say(line,a){
      refused.textContent=line;
      if(a){var l=document.createElement('a');l.href=a;l.target='_blank';l.rel='noopener';l.textContent=a;refused.appendChild(document.createTextNode(' '));refused.appendChild(l);}
      refused.hidden=false;
    }
    function quiet(){err.hidden=true;fail.hidden=true;refused.hidden=true;refused.textContent='';}
    f.addEventListener('submit',function(e){
      e.preventDefault();
      quiet();
      var need=cfg.fields.every(function(x){return !x.required||String(f.elements[x.name].value||'').trim().length>0;});
      var mail=cfg.fields.every(function(x){return x.record!==C.email||/.+@.+\..+/.test(f.elements[x.name].value);});
      if(!need||!mail){err.hidden=false;return;}
      var rec=recordOf(f,cfg);
      if(rec.text.length<C.text.min||rec.text.length>C.text.max){say(C.lines.text);return;}
      if(!state.signedIn){
        keep(f,id,cfg);
        if(state.powch){var q=DeSciX.powch.login();if(q&&typeof q.then==='function')q.then(null,function(x){console.error(id+': sign-in did not complete:',x);});return;}
        if(state.shell){say(C.lines.signin);return;}
        say(C.lines.outside,C.page_url);return;
      }
      var send=f.querySelector('button[type=submit]');send.disabled=true;
      function refuse(x){
        var code=codeOf(x);
        console.error(id+': not sent ('+(code||'no code')+'):',x);
        send.disabled=false;
        if(!code&&x!=null&&x.message===C.signed_out){say(C.lines.signin);return;}
        if(!code||!C.refusals[code]){fail.hidden=false;return;}
        var fx=code==='PROPOSAL_FIELD_INVALID'?fieldOf(x,cfg):null;
        var c=fx&&f.elements[fx.name],lab=c&&c.id&&f.querySelector('label[for="'+c.id+'"]');
        if(c&&c.setAttribute)c.setAttribute('aria-invalid','true');
        say(C.refusals[code]+(fx?' '+(lab?lab.textContent:fx.name):''));
      }
      Promise.resolve().then(function(){
        return DeSciX.call(C.command,{app_id:C.app_id,kb_id:C.kb_id,records:[rec]});
      }).then(function(r){
        drop(id);
        var rid=idOf(r),rc=el(P.receipt);
        if(rid){el(P.receiptId).textContent=rid;rc.hidden=false;} else rc.hidden=true;
        f.hidden=true;done.hidden=false;done.scrollIntoView({behavior:'smooth',block:'center'});
      },refuse);
    });
    label(f);
  }
  Object.keys(C.forms).forEach(function(id){wire(id,C.forms[id]);});
  egptSiteAuth.watch(function(s){state=s;labels();});
  // the licence form's wallet check: a placeholder that shows two example balances (request.need.2 says so)
  var wb=el('btn-connect'); if(wb){
    var connected=false;
    wb.addEventListener('click',function(){
      connected=!connected;
      var st=el('wallet-state'),bal=el('bal-amt'),v=el('bal-verdict'),buy=el('btn-buy');
      st.hidden=false;
      var mock=connected?2500000:12500000;
      bal.textContent=mock.toLocaleString();
      var enough=mock>=10000000;
      v.textContent=enough?'enough for the next licence':'short of the next licence';
      v.className=enough?'ok':'short';
      buy.hidden=enough;
      this.textContent=connected?'Try the other balance':'Connect wallet (Powch)';
    });
  }
})();

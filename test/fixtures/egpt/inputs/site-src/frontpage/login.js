(function(){
  // ONE component: the Powch login button (#descix-login). Behind the DeSciX App Shell,
  // DeSciX.powch.login() opens Powch; on success the SHELL routes to the dashboard itself
  // (its LOGIN_SUCCESS → home view), so this page never redirects. Outside the shell, or on a
  // host that does not publish Powch, the button stays what it is in the markup: a plain link
  // to the platform. Capability is checked at the moment of use, never captured at load.
  var btn=document.getElementById('descix-login'); if(!btn) return;
  if(!(window.DeSciX&&typeof DeSciX.ready==='function')) return;
  DeSciX.ready().then(function(r){
    if(!r||r.mode!=='shell') return;
    btn.addEventListener('click',function(e){
      var p=DeSciX.powch;
      if(!(p&&typeof p.login==='function')) return;
      e.preventDefault(); p.login();
    });
  });
})();

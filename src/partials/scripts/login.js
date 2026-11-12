(function(){
  // The Powch login button (#descix-login). Behind the DeSciX App Shell, once Powch is on the shell's bus, a click calls
  // DeSciX.powch.login(), which opens Powch; on success the SHELL routes to the dashboard itself, so this page never
  // redirects. Outside the shell, or before Powch is there, the button stays what it is in the markup: a plain link to
  // the platform. The sign-in state is the theme's auth watcher's (egptSiteAuth): the label reads the nav.login.signedin
  // copy while signed in and the markup's own label otherwise.
  var L={{login:config}};
  var btn=document.getElementById('descix-login'); if(!btn) return;
  var label=btn.textContent,st=null;
  egptSiteAuth.watch(function(s){st=s;btn.textContent=s.signedIn?L.signedIn:label;});
  btn.addEventListener('click',function(e){
    if(!(st&&st.powch)) return;
    e.preventDefault(); DeSciX.powch.login();
  });
})();

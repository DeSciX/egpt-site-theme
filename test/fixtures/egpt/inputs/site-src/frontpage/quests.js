(function(){
  // The quest board's ONE submission hook. A Submit button calls questSubmit(questId); the data
  // plane and its verbs are DEVPLANE's design and are not wired, so today the hook says so,
  // out loud, on the page. It never reports a submission that was not made. When the verbs land,
  // this function is the only thing that changes: sign-in through Powch, then the submit verb.
  var note=document.getElementById('quest-note'); if(!note) return;
  function questSubmit(id){
    note.hidden=false;
    note.textContent='Submissions are not open yet. This row is an example'+(id?' ('+id+')':'')+'; when quests go live you will sign in with Powch and submit here.';
  }
  window.DeSciXQuests={ submit: questSubmit };
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-quest-submit]'); if(!b) return;
    var row=b.closest('[data-quest]'); questSubmit(row?row.getAttribute('data-quest'):'');
  });
})();

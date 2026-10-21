(function(){
  var f=document.getElementById('licence-form'),done=document.getElementById('form-done'),err=document.getElementById('form-err');
  var connected=false;
  document.getElementById('btn-connect').addEventListener('click',function(){
    connected=!connected;
    var st=document.getElementById('wallet-state'),bal=document.getElementById('bal-amt'),v=document.getElementById('bal-verdict'),buy=document.getElementById('btn-buy');
    st.hidden=false;
    var mock=connected?2500000:12500000;
    bal.textContent=mock.toLocaleString();
    var enough=mock>=10000000;
    v.textContent=enough?'enough for the next licence':'short of the next licence';
    v.className=enough?'ok':'short';
    buy.hidden=enough;
    this.textContent=connected?'Try the other balance':'Connect wallet (Powch)';
  });
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var need=['f-who','f-org','f-use','f-contact'].every(function(id){return document.getElementById(id).value.trim().length>0});
    var mail=/.+@.+\..+/.test(document.getElementById('f-contact').value);
    if(!need||!mail){err.hidden=false;return;}
    err.hidden=true;f.hidden=true;done.hidden=false;done.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();
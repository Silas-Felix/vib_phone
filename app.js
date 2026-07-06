const res = typeof GetParentResourceName === 'function' ? GetParentResourceName() : 'vib_phone';
const phone = document.getElementById('phone');
const home = document.getElementById('home');
const appView = document.getElementById('appView');
const callView = document.getElementById('callView');
const appContent = document.getElementById('appContent');
const toast = document.getElementById('toast');
const notification = document.getElementById('notification');

let DATA = { contacts: [], messages: {}, tweets: [], callLogs: [], photos: [], settings: { wallpaper: 1 } };

// Robust icon fallback. Beholder dine egne ikoner, men prøver flere normale filnavne hvis et ikon ikke loader.
const ICON_FALLBACKS = {
  messages: ['img/icons/message.png','img/icons/messages.png','img/icons/beskeder.png','img/icons/sms.png','img/icons/messages.jpg','img/icons/message.jpg'],
  calls: ['img/icons/calls.png','img/icons/call.png','img/icons/opkald.png'],
  contacts: ['img/icons/contacts.png','img/icons/contact.png','img/icons/kontakter.png'],
  twitter: ['img/icons/twitter.png','img/icons/x.png'],
  camera: ['img/icons/camera.png','img/icons/kamera.png'],
  photos: ['img/icons/photos.png','img/icons/fotos.png'],
  settings: ['img/icons/settings.png','img/icons/setting.png']
};
function initIconFallbacks(){
  document.querySelectorAll('img[data-icon]').forEach(img=>{
    const key=img.dataset.icon;
    const list=ICON_FALLBACKS[key]||[];
    img.dataset.tryIndex=String(Math.max(0,list.indexOf(img.getAttribute('src')||'')));
    img.onerror=function(){
      const tries=ICON_FALLBACKS[key]||[];
      let i=parseInt(img.dataset.tryIndex||'0',10)+1;
      if(i<tries.length){ img.dataset.tryIndex=String(i); img.src=tries[i]; }
      else { img.onerror=null; }
    };
  });
}


function normalizeData(d){
  d = d || {};
  d.contacts = (d.contacts || []).map(c => ({
    ...c,
    number: String(c.number || c.phone_number || c.phoneNumber || '').trim(),
    name: c.name || c.display_name || c.phone_number || c.number || 'Ukendt'
  }));
  d.messages = d.messages || {};
  Object.keys(d.messages).forEach(k => {
    const c = d.messages[k] || {};
    c.number = String(c.number || c.phone_number || '').trim();
    c.items = c.items || [];
    d.messages[k] = c;
  });
  d.tweets = d.tweets || [];
  d.twitterAccount = d.twitterAccount || null;
  d.callLogs = d.callLogs || [];
  d.photos = d.photos || [];
  d.settings = d.settings || { wallpaper: 1 };
  // Bevar live client-status som ikke kommer fra SQL-pakken (fx bil/CarPlay).
  if (typeof DATA !== 'undefined' && DATA && DATA.inVehicle !== undefined && d.inVehicle === undefined) d.inVehicle = DATA.inVehicle;
  return d;
}

let activeApp = 'home';
let activeConversation = null;
let composerOpen = false;
let composerRecipient = '';
let messageSearch = '';
let contactMenuOpen = false;
let contactViewNumber = null;
let contactEditMode = false;
let callTab = 'recent';
let callEditMode = false;
let callSearch = '';
let callInfoId = null;
let callFilter = 'all';
let callMenuOpen = false;
let twitterIntroDone = false;
let twitterComposerOpen = false;
let twitterActivePostId = null;
let twitterCommentText = '';
let callContactSearch = '';
let callContactView = null;
let callContactEdit = false;
let contactsStandalone = false;
let keypadNumber = '';
let keypadAddMenuOpen = false;
let currentCall = null;
let muted = false;
let speaker = false;
let callIsActive = false;
let currentCallName = 'Opkald';
let contactFlags = {};
function contactFlag(number, key){ const n=String(number||''); contactFlags[n]=contactFlags[n]||{favorite:false, emergency:false, blocked:false}; return !!contactFlags[n][key]; }
function toggleContactFlag(number, key){ const n=String(number||''); contactFlags[n]=contactFlags[n]||{favorite:false, emergency:false, blocked:false}; contactFlags[n][key]=!contactFlags[n][key]; renderCalls(); }


let settingsPage = 'main';
let vibSettings = JSON.parse(localStorage.getItem('vib_phone_settings') || '{}');
vibSettings = Object.assign({
  notifications: true,
  twitterNotifications: true,
  messagePreview: true,
  cameraGrid: true,
  cameraLive: true,
  photosHaptics: true,
  reduceMotion: false,
  textSize: 'Normal',
  sound: true,
  appearance: 'light',
  brightness: 86,
  autoBrightness: true,
  wifi: true,
  bluetooth: true,
  cellular: true,
  appBadges: true,
  haptics: true
}, vibSettings);
function persistVibSettings(){ localStorage.setItem('vib_phone_settings', JSON.stringify(vibSettings)); }
function applyPhoneAppearance(){
  const dark = vibSettings.appearance === 'dark';
  phone.classList.toggle('theme-dark', dark);
  phone.classList.toggle('theme-light', !dark);
  phone.style.setProperty('--vib-brightness', String((Number(vibSettings.brightness||86))/100));
}

function updatePhoneAppClass(app){
  try{
    phone.classList.remove('app-messages','app-calls','app-contacts','app-twitter','app-settings','app-camera','app-photos','app-home');
    phone.classList.add('app-' + (app || activeApp || 'home'));
  }catch(e){}
}

function toggleVibSetting(key){ vibSettings[key] = !vibSettings[key]; persistVibSettings(); applyPhoneAppearance(); renderSettings(settingsPage); }
function setVibSetting(key, value){ vibSettings[key] = value; persistVibSettings(); applyPhoneAppearance(); renderSettings(settingsPage); }
function setVibSlider(key, value){ vibSettings[key] = Number(value); persistVibSettings(); applyPhoneAppearance(); const el=event&&event.target?event.target:null; if(el) updateRangeVisual(el); }
function settingsBack(){ settingsPage='main'; renderSettings('main'); }
function settingsOpen(page){ settingsPage=page; renderSettings(page); }
function settingsToggleWallpaper(i){ nui('setWallpaper',{index:i}); DATA.settings = DATA.settings || {}; DATA.settings.wallpaper=i; setWallpaper(i); renderSettings('wallpaper'); }
function appIconHtml(key){ const map={messages:'message',calls:'calls',contacts:'contacts',twitter:'twitter',camera:'camera',photos:'photos',settings:'settings'}; const first=map[key]||key; return `<img class="settings-app-img" src="img/icons/${first}.png" onerror="this.onerror=null;this.src='img/icons/${key}.png'">`; }
function updateRangeVisual(el){
  if(!el) return;
  const min=Number(el.min||0), max=Number(el.max||100), val=Number(el.value||0);
  const pct=Math.max(0,Math.min(100,((val-min)/(max-min))*100));
  el.style.setProperty('--range-fill', pct+'%');
}
function hydrateRanges(){ document.querySelectorAll('.ios-range').forEach(updateRangeVisual); }

function nui(name, data = {}) {
  fetch(`https://${res}/${name}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function showToast(text){ toast.textContent = text; toast.classList.remove('hidden'); setTimeout(()=>toast.classList.add('hidden'),2600); }
function setPage(p){ home.classList.remove('active'); appView.classList.remove('active'); callView.classList.remove('active'); p.classList.add('active'); }
function setWallpaper(i){ phone.className = phone.className.replace(/wallpaper-\d/g,'').trim(); phone.classList.add(`wallpaper-${i||1}`); }
function contactByNumber(number){ const n=String(number||'').replace(/\s+/g,''); return (DATA.contacts||[]).find(x=>String(x.number||x.phone_number||'').replace(/\s+/g,'')===n); }
function contactName(number){ const c=contactByNumber(number); return c ? c.name : number; }
function contactInitial(number){ const n=contactName(number); return String(n||'?').charAt(0).toUpperCase(); }
function lastItem(conv){ const a=(conv&&conv.items)||[]; return a.length?a[a.length-1]:null; }
function formatChatTime(stamp){
  if(!stamp) return '';
  const d=new Date(stamp*1000); const now=new Date();
  const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
  if(d.toDateString()===now.toDateString()) return `${hh}:${mm}`;
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${hh}:${mm}`;
}
function getUnreadCount(){ return Object.values(DATA.messages||{}).filter(c=>c && c.unread===true).length; }
function updateBadges(){
  const n=getUnreadCount();
  ['messagesBadge','messagesDockBadge'].forEach(id=>{ const el=document.getElementById(id); if(!el) return; el.textContent=n>99?'99+':String(n); el.classList.toggle('hidden', n<=0); });
}
function setMiniCall(show){
  const mini=document.getElementById('miniCall'); if(!mini) return;
  mini.classList.toggle('hidden', !show);
  if(show){ document.getElementById('miniCallName').textContent=currentCallName||'Opkald'; document.getElementById('miniCallStatus').textContent=callIsActive?'I opkald':'Ringer...'; }
}
function openApp(app){
  if(activeApp==='camera' && app!=='camera') cameraNativeExit();
  activeApp=app; updatePhoneAppClass(app); activeConversation=null; composerOpen=false; contactMenuOpen=false; contactEditMode=false; contactViewNumber=null;
  setPage(appView); phone.classList.add('ios-light-app'); renderApp(app);
}
function backHome(){
  if(activeApp==='camera') cameraNativeExit();
  phone.classList.remove('keypad-mode');
  activeConversation=null; composerOpen=false; contactMenuOpen=false; contactEditMode=false; contactViewNumber=null;
  setPage(home); activeApp='home'; updatePhoneAppClass('home'); phone.classList.remove('ios-light-app'); appContent.innerHTML='';
}
function renderApp(app){
  if(app==='messages') return renderMessages();
  if(app==='calls') return renderCalls();
  if(app==='contacts') return renderContacts();
  if(app==='twitter') return renderTwitter();
  if(app==='settings') return renderSettings();
  if(app==='camera') return renderCamera();
  if(app==='photos') return renderPhotos();
}

function renderMessages(){
  phone.classList.remove('keypad-mode');
  phone.classList.add('ios-light-app');
  if(contactViewNumber) return renderContactCard(contactViewNumber);
  if(activeConversation) return renderConversation(activeConversation);
  const convs=Object.entries(DATA.messages||{}).sort((a,b)=>((lastItem(b[1])?.stamp)||0)-((lastItem(a[1])?.stamp)||0));
  appContent.innerHTML=`
    <div class="messages-screen">
      <div class="messages-actions"><button class="ios-text-btn" onclick="showToast('Rediger kommer i en senere version')">Rediger</button><button class="ios-text-btn" onclick="openComposer()">Ny chat</button></div>
      <h1 class="messages-title">Beskeder</h1>
      <input id="messageSearch" class="ios-search-input" placeholder="Søg" value="${esc(messageSearch)}">
      <div id="chatList" class="ios-chat-list">${messageListHtml(convs)}</div>
      ${composerOpen ? composerHtml() : ''}
    </div>`;
  const search=document.getElementById('messageSearch');
  if(search){
    search.addEventListener('input', function(){ messageSearch=this.value; filterMessageList(); });
  }
  if(composerOpen) initComposerInputs();
}
function messageListHtml(convs){
  const q=String(messageSearch||'').toLowerCase().trim();
  const filtered=convs.filter(([key,c])=>{
    const li=lastItem(c); const hay=[contactName(c.number),c.number,li?.text||''].join(' ').toLowerCase(); return !q || hay.includes(q);
  });
  if(!filtered.length) return '<div class="ios-empty">Ingen samtaler fundet.</div>';
  return filtered.map(([key,c])=>{ const li=lastItem(c); const unread=c.unread===true; return `<div class="ios-chat-item ${unread?'unread':''}" data-search="${esc([contactName(c.number),c.number,li?.text||''].join(' ').toLowerCase())}" onclick="openConversation('${esc(key)}')">
    <span class="unread-dot"></span><div class="avatar">${esc(contactInitial(c.number))}</div>
    <div class="chat-info"><div class="chat-title">${esc(contactName(c.number))}</div><div class="chat-preview">${esc(li?.text||'Ingen beskeder endnu')}</div></div>
    <div class="chat-meta"><span>${esc(formatChatTime(li?.stamp))}</span><b>›</b></div>
  </div>`}).join('');
}
function filterMessageList(){
  const convs=Object.entries(DATA.messages||{}).sort((a,b)=>((lastItem(b[1])?.stamp)||0)-((lastItem(a[1])?.stamp)||0));
  const list=document.getElementById('chatList'); if(list) list.innerHTML=messageListHtml(convs);
}
function openConversation(key){
  activeConversation=key; composerOpen=false; contactMenuOpen=false; contactViewNumber=null; contactEditMode=false;
  const conv=DATA.messages[key]; if(conv && conv.unread){ conv.unread=false; updateBadges(); nui('readConversation',{key}); }
  renderMessages();
}
function renderConversation(key){
  const conv=DATA.messages[key] || {number:'',items:[]};
  const items=(conv.items||[]);
  appContent.innerHTML=`
    <div class="conversation-screen">
      <div class="conv-header-card conv-header-top">
        <button class="conv-back" onclick="activeConversation=null;contactMenuOpen=false;renderMessages()">‹ Beskeder</button>
        <div class="conv-contact-center" onclick="toggleContactMenu()"><b>${esc(contactName(conv.number))}</b><small>${esc(conv.number)}</small></div>
        <div></div>
        ${contactMenuOpen ? contactMenuHtml(conv.number) : ''}
      </div>
      <div class="ios-chat-box" id="chatBox">${items.map(m=>`<div class="bubble ${m.from==DATA.number?'me':'them'}"><div>${esc(m.text)}</div><div class="small" style="color:inherit;opacity:.62">${esc(m.time)}</div></div>`).join('')}</div>
      <div class="send-row"><input id="msgText" class="ios-imessage-input" placeholder="iMessage"><button class="ios-send-btn" onclick="sendMsg('${esc(conv.number)}')">↑</button></div>
    </div>`;
  const input=document.getElementById('msgText');
  if(input){
    input.addEventListener('keydown', function(e){
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMsg(conv.number); }
    });
  }
  setTimeout(()=>{let b=document.getElementById('chatBox'); if(b)b.scrollTop=b.scrollHeight;},60);
}
function toggleContactMenu(){ contactMenuOpen=!contactMenuOpen; renderConversation(activeConversation); }
function contactMenuHtml(number){
  const c=contactByNumber(number);
  return `<div class="contact-popover">
    <button onclick="contactViewNumber='${esc(number)}';contactEditMode=false;contactMenuOpen=false;renderMessages()">${c?'Se kontakt':'Opret kontakt'}</button>
    <button onclick="showInfo('${esc(number)}')">Vis info</button>
  </div>`;
}
function showInfo(number){
  contactViewNumber=String(number);
  contactEditMode=false;
  contactMenuOpen=false;
  renderContactInfo(number);
}
function renderContactInfo(number){
  const c=contactByNumber(number) || { name: number, number: number, company:'', nickname:'', notes:'' };
  const conv=Object.values(DATA.messages||{}).find(x=>String(x.number)===String(number));
  const count=(conv&&conv.items)?conv.items.length:0;
  const last=conv&&conv.items&&conv.items.length?conv.items[conv.items.length-1]:null;
  appContent.innerHTML=`<div class="contact-info-screen">
    <button class="ios-back-top" onclick="renderConversation(activeConversation)">‹ Tilbage</button>
    <div class="contact-large-avatar">${esc(contactInitial(number))}</div>
    <div class="contact-name">${esc(c.name||number)}</div>
    <div class="contact-number">${esc(c.number||number)}</div>
    <div class="contact-action-row"><button onclick="nui('startCall',{number:'${esc(c.number||number)}'})">Ring</button><button onclick="renderConversation(activeConversation)">Besked</button></div>
    <div class="ios-info-group">
      <div class="ios-info-row"><label>Mobil</label><span>${esc(c.number||number)}</span></div>
      <div class="ios-info-row"><label>Beskeder</label><span>${count}</span></div>
      <div class="ios-info-row"><label>Seneste aktivitet</label><span>${esc(last?formatChatTime(last.stamp):'Ingen')}</span></div>
      ${c.company?`<div class="ios-info-row"><label>Firma</label><span>${esc(c.company)}</span></div>`:''}
      ${c.nickname?`<div class="ios-info-row"><label>Kælenavn</label><span>${esc(c.nickname)}</span></div>`:''}
    </div>
    <div class="ios-info-group"><div class="ios-info-notes"><label>Noter</label><p>${esc(c.notes||'Ingen noter')}</p></div></div>
    <button class="edit-link" onclick="contactEditMode=true;renderContactCard('${esc(number)}')">Ændr.</button>
  </div>`;
}
function renderContactCard(number){
  const c=contactByNumber(number) || { name:'', number:number, company:'', nickname:'', notes:'' };
  const isExisting=!!contactByNumber(number);
  if(contactEditMode){
    appContent.innerHTML=`<div class="contact-screen">
      <div class="edit-top"><button onclick="contactEditMode=false;renderMessages()">Annuller</button><b>${isExisting?'Rediger kontakt':'Ny kontakt'}</b><button onclick="saveContactEdit('${esc(number)}')">Gem</button></div>
      <div class="edit-form">
        <input id="editName" placeholder="Navn" value="${esc(c.name||'')}">
        <input id="editNumber" placeholder="Telefon" value="${esc(c.number||number)}">
        <input id="editCompany" placeholder="Firma" value="${esc(c.company||'')}">
        <input id="editNick" placeholder="Kælenavn" value="${esc(c.nickname||'')}">
        <textarea id="editNotes" placeholder="Noter">${esc(c.notes||'')}</textarea>
      </div>
    </div>`;
    return;
  }
  appContent.innerHTML=`<div class="contact-screen">
    <div class="contact-large-avatar">${esc(contactInitial(number))}</div>
    <div class="contact-name">${esc(c.name||number)}</div>
    <div class="contact-number">${esc(c.number||number)}</div>
    <div class="contact-action-row"><button onclick="nui('startCall',{number:'${esc(c.number||number)}'})">Ring</button><button onclick="activeConversation=getConversationKeyForNumber('${esc(c.number||number)}');contactViewNumber=null;renderMessages()">Besked</button></div>
    <button class="back-pill" onclick="contactViewNumber=null;renderMessages()">Tilbage</button>
    <div class="contact-card"><label>Mobil</label><div>${esc(c.number||number)}</div></div>
    ${c.company?`<div class="contact-card"><label>Firma</label><div>${esc(c.company)}</div></div>`:''}
    ${c.nickname?`<div class="contact-card"><label>Kælenavn</label><div>${esc(c.nickname)}</div></div>`:''}
    <div class="contact-card"><label>Noter</label><div>${esc(c.notes||'Ingen noter')}</div></div>
    <button class="edit-link" onclick="contactEditMode=true;renderMessages()">Ændr.</button>
  </div>`;
}
function saveContactEdit(oldNumber){
  const payload={ oldNumber, name:document.getElementById('editName').value, number:document.getElementById('editNumber').value, company:document.getElementById('editCompany').value, nickname:document.getElementById('editNick').value, notes:document.getElementById('editNotes').value };
  nui('saveContact', payload);
  contactViewNumber=payload.number; contactEditMode=false;
}
function getConversationKeyForNumber(number){
  const found=Object.entries(DATA.messages||{}).find(([k,c])=>String(c.number)===String(number));
  return found ? found[0] : null;
}
function openComposer(){ composerOpen=true; composerRecipient=''; renderMessages(); }
function closeComposer(){ composerOpen=false; composerRecipient=''; renderMessages(); }
function composerHtml(){
  return `<div class="composer-backdrop"><div class="ios-composer">
    <div class="composer-head"><h3>Ny besked</h3><button onclick="closeComposer()">×</button></div>
    <label class="to-row"><span>Til:</span><input id="composerTo" placeholder="Navn eller nummer" autocomplete="off"></label>
    <div id="composerSuggestions" class="suggestions"></div>
    <div class="send-row composer-send"><input id="composerText" class="ios-imessage-input" placeholder="iMessage"><button class="ios-send-btn" onclick="sendComposerMsg()">↑</button></div>
  </div></div>`;
}
function initComposerInputs(){
  const inp=document.getElementById('composerTo'); if(!inp) return;
  inp.value=composerRecipient;
  inp.addEventListener('input', function(){ composerRecipient=this.value; updateComposerSuggestions(); });
  const txt=document.getElementById('composerText');
  if(txt){
    txt.addEventListener('keydown', function(e){
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendComposerMsg(); }
    });
  }
  setTimeout(()=>{ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); updateComposerSuggestions(); },80);
}
function updateComposerSuggestions(){
  const box=document.getElementById('composerSuggestions'); if(!box) return;
  const q=(composerRecipient||'').toLowerCase().trim();
  const suggestions=(DATA.contacts||[]).filter(c=>!q || String(c.name).toLowerCase().includes(q) || String(c.number).includes(q)).slice(0,6);
  box.innerHTML=suggestions.map(c=>{ const n=esc(c.number||c.phone_number||''); return `<button type="button" onmousedown="event.preventDefault()" onclick="selectComposerRecipient('${n}')"><b>${esc(c.name)}</b><small>${n}</small></button>` }).join('');
}
function selectComposerRecipient(n){
  composerRecipient=String(n);
  const inp=document.getElementById('composerTo');
  if(inp){ inp.value=composerRecipient; inp.dispatchEvent(new Event('input', { bubbles:true })); }
  updateComposerSuggestions();
  const m=document.getElementById('composerText'); if(m)m.focus();
}
function resolveRecipient(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  const direct=raw.replace(/\s+/g,'');
  const byNumber=contactByNumber(direct);
  if(byNumber) return byNumber.number || byNumber.phone_number;
  const lower=raw.toLowerCase();
  const byName=(DATA.contacts||[]).find(c=>String(c.name||'').toLowerCase()===lower);
  return byName ? (byName.number||byName.phone_number) : direct;
}
function sendComposerMsg(){
  const n=resolveRecipient(document.getElementById('composerTo')?.value||composerRecipient||'');
  const t=document.getElementById('composerText')?.value||'';
  if(n&&t.trim()){ nui('sendMessage',{number:n,text:t}); composerOpen=false; composerRecipient=''; }
}

function sendMsg(number){ const input=document.getElementById('msgText'); const t=input?input.value:''; if(t.trim()){ nui('sendMessage',{number,text:t}); if(input) input.value=''; } }

function renderCalls(){
  contactsStandalone = false;
  phone.classList.add('ios-light-app');
  phone.classList.toggle('keypad-mode', callTab==='keypad');
  if(callInfoId) return renderCallInfo(callInfoId);
  if(callTab==='keypad') return renderKeypad();
  if(callTab==='contacts') return renderCallContacts();
  if(callTab==='favorites') return renderCallPlaceholder('Favoritter','Dine favoritkontakter kommer her. Du kan føje folk til favoritter fra info-siden.');
  if(callTab==='voicemail') return renderCallPlaceholder('Telefonsvarer','Ingen telefonsvarer endnu.');
  const q=String(callSearch||'').toLowerCase().trim();
  const logs=(DATA.callLogs||[]).filter(l=>{
    const num=String(l.other_number||l.number||'');
    const name=contactName(num);
    const hay=[name,num,l.direction,l.status].join(' ').toLowerCase();
    const matchesSearch=!q || hay.includes(q);
    const matchesFilter=callFilter!=='missed' || l.status==='missed';
    return matchesSearch && matchesFilter;
  });
  appContent.innerHTML=`<div class="ios-call-screen">
    <div class="call-safe-fade"></div>
    <div class="call-topbar">
      <button class="ios-call-edit" onclick="toggleCallEdit()">${callEditMode?'Færdig':'Rediger'}</button>
      <div class="call-filter ${callFilter==='missed'?'missed-active':''}">
        <span class="call-filter-pill"></span>
        <button class="${callFilter==='all'?'active':''}" onclick="setCallFilter('all')">Alle</button>
        <button class="${callFilter==='missed'?'active':''}" onclick="setCallFilter('missed')">Ubesvaret</button>
      </div>
      <button class="call-menu-btn" onclick="toggleCallMenu()">☰</button>
      ${callMenuOpen?callMenuHtml():''}
    </div>
    <h1 class="call-title-main">Seneste</h1>
    <input id="callSearch" class="ios-call-search" placeholder="Søg" value="${esc(callSearch)}">
    <div class="call-list">${logs.map(l=>callLogHtml(l)).join('')||'<div class="ios-empty">Ingen opkald fundet.</div>'}</div>
    ${callBottomBar()}
  </div>`;
  const search=document.getElementById('callSearch');
  if(search){
    search.addEventListener('input', function(){ callSearch=this.value; renderCalls(); setTimeout(()=>{const s=document.getElementById('callSearch'); if(s){s.focus(); s.setSelectionRange(s.value.length,s.value.length)}},0); });
  }
}
function setCallFilter(filter){ callFilter=filter; callMenuOpen=false; renderCalls(); }
function toggleCallMenu(){ callMenuOpen=!callMenuOpen; renderCalls(); }
function callMenuHtml(){
  return `<div class="call-menu-popover">
    <button onclick="callFilter='all';callMenuOpen=false;renderCalls()"><b>Vis alle</b><small>Se hele din opkaldshistorik</small></button>
    <button onclick="callFilter='missed';callMenuOpen=false;renderCalls()"><b>Kun ubesvarede</b><small>Filtrer efter mistede opkald</small></button>
    <button onclick="showToast('Opkaldsliste opdateret');nui('requestData');callMenuOpen=false;renderCalls()"><b>Opdater</b><small>Hent seneste opkald igen</small></button>
    <button class="danger" onclick="showToast('Brug Rediger for at slette enkelte opkald')"><b>Rediger liste</b><small>Fjern opkald én ad gangen</small></button>
  </div>`;
}
function callLogHtml(l){
  const num=String(l.other_number||l.number||'');
  const name=contactName(num);
  const initial=String(name||num||'?').charAt(0).toUpperCase();
  const dir=l.direction==='incoming'?'↙':'↗';
  const missed=l.status==='missed';
  const status=missed?'ubesvaret':'telefon';
  return `<div class="call-row ${missed?'missed':''}">
    ${callEditMode?`<button class="call-delete" onclick="event.stopPropagation();deleteCallLog(${Number(l.id)||0})">−</button>`:''}
    <div class="call-avatar">${esc(initial)}</div>
    <div class="call-main" onclick="nui('startCall',{number:'${esc(num)}'})"><b>${esc(name)}</b><small>${dir} ${esc(status)}${Number(l.count||1)>1?' ('+Number(l.count)+')':''}</small></div>
    <div class="call-date">${esc(formatCallDate(l.started_at||l.created_at||l.stamp))}</div>
    <button class="call-info" onclick="event.stopPropagation();openCallInfo(${Number(l.id)||0})">i</button>
  </div>`;
}
function tabbarIconCandidates(key){
  const map={
    favorites:['favorites.png','favorite.png','favoritter.png','star.png','favorites.jpg','favorites.jpeg','favorites.webp','favorites.svg'],
    recent:['recent.png','recents.png','seneste.png','clock.png','recent.jpg','recent.jpeg','recent.webp','recent.svg'],
    contacts:['contacts.png','contact.png','kontakter.png','person.png','contacts.jpg','contacts.jpeg','contacts.webp','contacts.svg'],
    keypad:['keypad.png','dialpad.png','numerisk.png','numpad.png','keypad.jpg','keypad.jpeg','keypad.webp','keypad.svg'],
    voicemail:['voicemail.png','telefonsvarer.png','mailbox.png','voicemail.jpg','voicemail.jpeg','voicemail.webp','voicemail.svg']
  };
  return map[key] || [`${key}.png`];
}
function tabbarIconHtml(key){
  const list=tabbarIconCandidates(key);
  const encoded=encodeURIComponent(JSON.stringify(list));
  const first=`./img/tabbar_icons/${list[0]}`;
  // V33: bruger både <img> og CSS-background som fallback, så der ikke vises broken-image ikon.
  return `<span class="tab-icon" data-tabbar-key="${key}" style="--tab-icon:url('${first}')"><img data-tabbar-key="${key}" data-tabbar-list="${encoded}" data-tabbar-index="0" src="${first}" alt="" onerror="tabbarIconError(this)" onload="tabbarIconLoaded(this)"></span>`;
}
function tabbarIconLoaded(img){
  if(img && img.parentElement){
    img.parentElement.classList.remove('tab-icon-missing');
    img.style.display='block';
  }
}
function tabbarIconError(img){
  let list=[];
  try{ list=JSON.parse(decodeURIComponent(img.dataset.tabbarList||'%5B%5D')); }catch(e){ list=[]; }
  let i=parseInt(img.dataset.tabbarIndex||'0',10)+1;
  if(i<list.length){
    img.dataset.tabbarIndex=String(i);
    const next=`./img/tabbar_icons/${list[i]}`;
    if(img.parentElement) img.parentElement.style.setProperty('--tab-icon', `url('${next}')`);
    img.src=next;
    return;
  }
  // Skjul browserens broken-image symbol, men behold knappen pæn.
  img.onerror=null;
  img.style.display='none';
  if(img.parentElement) img.parentElement.classList.add('tab-icon-missing');
}
function callBottomBar(){
  // V32: Hotbar-ikoner kan udskiftes i html/img/tabbar_icons/.
  // Primære filnavne: favorites.png, recent.png, contacts.png, keypad.png, voicemail.png
  // Fallback understøtter også danske navne og jpg/jpeg/webp/svg.
  const tabs=[
    ['favorites','Favoritter'],
    ['recent','Seneste'],
    ['contacts','Kontakter'],
    ['keypad','Numerisk blok'],
    ['voicemail','Telefonsvarer']
  ];
  const activeFor=(key)=> key==='recent' ? (callTab==='recent' || callTab==='missed') : callTab===key;
  return `<div class="ios-call-tabbar">${tabs.map(t=>`<button class="${activeFor(t[0])?'active':''}" onclick="callTab='${t[0]}';callInfoId=null;callMenuOpen=false;renderCalls()">${tabbarIconHtml(t[0])}<small>${t[1]}</small></button>`).join('')}</div>`;
}
function toggleCallEdit(){ callEditMode=!callEditMode; callMenuOpen=false; renderCalls(); }
function deleteCallLog(id){ if(!id) return; const row=event&&event.target?event.target.closest('.call-row'):null; if(row) row.classList.add('removing'); DATA.callLogs=(DATA.callLogs||[]).filter(x=>Number(x.id)!==Number(id)); nui('deleteCallLog',{id}); setTimeout(()=>renderCalls(),90); setTimeout(()=>nui('requestData'),220); }
function openCallInfo(id){ callInfoId=id; callMenuOpen=false; renderCalls(); }
function renderCallInfo(id){
  const l=(DATA.callLogs||[]).find(x=>Number(x.id)===Number(id)); if(!l){ callInfoId=null; return renderCalls(); }
  const num=String(l.other_number||''); const c=contactByNumber(num); const name=contactName(num);
  appContent.innerHTML=`<div class="ios-call-info-screen">
    <div class="call-safe-fade"></div>
    <div class="call-info-scroll">
      <button class="ios-info-back" onclick="callInfoId=null;renderCalls()">‹ Seneste</button>
      <div class="call-info-card-top"><div class="call-avatar big">${esc(String(name||num||'?').charAt(0).toUpperCase())}</div><h2>${esc(name)}</h2><p>${esc(num)}</p><div class="contact-action-row"><button onclick="nui('startCall',{number:'${esc(num)}'})">Ring</button><button onclick="activeApp='messages';activeConversation=getConversationKeyForNumber('${esc(num)}');callInfoId=null;renderMessages()">Besked</button></div></div>
      <div class="call-detail-card"><label>Type</label><div>${l.direction==='incoming'?'Indgående':'Udgående'} ${l.status==='missed'?'ubesvaret':'opkald'}</div></div>
      <div class="call-detail-card"><label>Tidspunkt</label><div>${esc(formatCallFullDate(l.started_at))}</div></div>
      <div class="call-detail-card"><label>Varighed</label><div>${esc(formatDuration(l.duration||0))}</div></div>
      <div class="call-info-actions"><button onclick="showToast('Kontakt blokeret')">Bloker kontakt</button><button onclick="showToast('Føjet til favoritter')">Føj til favoritter</button>${c?`<button onclick="callContactView='${esc(num)}';callInfoId=null;callTab='contacts';renderCalls()">Se kontakt</button>`:`<button onclick="callContactView='${esc(num)}';callContactEdit=true;callInfoId=null;callTab='contacts';renderCalls()">Opret kontakt</button>`}</div>
    </div>
    ${callBottomBar()}
  </div>`;
}
function renderKeypad(){
  phone.classList.add('keypad-mode');
  const keys = [
    ['1',''], ['2','ABC'], ['3','DEF'],
    ['4','GHI'], ['5','JKL'], ['6','MNO'],
    ['7','PQRS'], ['8','TUV'], ['9','WXYZ'],
    ['*',''], ['0','+'], ['#','']
  ];
  appContent.innerHTML=`<div class="ios-call-screen keypad-screen">
    <div class="keypad-top-space"></div>
    <button class="keypad-add-contact" onclick="toggleKeypadAddMenu()" aria-label="Tilføj kontakt">
      <svg viewBox="0 0 24 24"><path d="M15.5 12.3c2.1 0 3.8-1.7 3.8-3.8s-1.7-3.8-3.8-3.8-3.8 1.7-3.8 3.8 1.7 3.8 3.8 3.8Zm-8.4-.2c1.8 0 3.3-1.5 3.3-3.3S8.9 5.5 7.1 5.5 3.8 7 3.8 8.8s1.5 3.3 3.3 3.3Zm8.4 1.7c-2.8 0-5.6 1.4-5.6 3.3v.6c0 .5.4.9.9.9h9.4c.5 0 .9-.4.9-.9v-.6c0-1.9-2.8-3.3-5.6-3.3ZM7.1 13.6c-2.4 0-4.8 1.2-4.8 2.8v.5c0 .4.3.8.8.8h4.8v-.6c0-1 .5-1.9 1.3-2.6-.7-.6-1.4-.9-2.1-.9Z"/><path d="M6.8 18.1h2.1v2.1h1.8v-2.1h2.1v-1.8h-2.1v-2.1H8.9v2.1H6.8v1.8Z"/></svg>
    </button>
    ${keypadAddMenuOpen ? keypadAddMenuHtml() : ''}
    <div class="keypad-number" id="keypadNumber">${esc(keypadNumber)}</div>
    <div id="keypadMatches" class="keypad-matches">${keypadMatchesHtml()}</div>
    <div class="keypad-grid ios-dark-grid">${keys.map(k=>`<button class="keypad-key" onclick="keypadPress('${k[0]}')"><b>${k[0]}</b><small>${k[1]}</small></button>`).join('')}</div>
    <div class="keypad-bottom-row">
      <div></div>
      <button class="keypad-call" onclick="startCall()" aria-label="Ring op">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.31-.31.76-.41 1.17-.27 1.29.43 2.68.66 4.12.66.72 0 1.3.58 1.3 1.3v3.48c0 .72-.58 1.3-1.3 1.3C10.39 22.15 1.85 13.61 1.85 3.3 1.85 2.58 2.43 2 3.15 2h3.5c.72 0 1.3.58 1.3 1.3 0 1.44.23 2.83.66 4.12.13.41.04.86-.27 1.17l-2.22 2.2z"/></svg>
      </button>
      <button class="keypad-delete ${keypadNumber?'':'hidden'}" id="keypadDelete" onclick="keypadBackspace()">×</button>
    </div>
    ${callBottomBar()}
  </div>`;
}
function keypadMatchesHtml(){
  const q=String(keypadNumber||'').replace(/\s+/g,'');
  if(!q || q.length < 2) return '';
  const matches=(DATA.contacts||[]).filter(c=>String(c.number||c.phone_number||'').replace(/\s+/g,'').includes(q) || String(c.name||'').toLowerCase().includes(q.toLowerCase()));
  if(!matches.length) return '';
  const first=matches[0];
  const more=Math.max(0,matches.length-1);
  return `<div class="keypad-match-card">
    <button class="keypad-match-row" onclick="keypadNumber='${esc(first.number||first.phone_number||'')}';updateKeypadView()"><span class="match-person">◉</span><b>${esc(first.name||first.number||first.phone_number)}</b><em>${esc(first.number||first.phone_number||'')}</em></button>
    ${more>0?`<button class="keypad-match-row muted" onclick="showToast('${more} resultat${more>1?'er':''} mere')"><span class="match-search">⌕</span><b>${more} resultat${more>1?'er':''} mere</b></button>`:''}
  </div>`;
}
function keypadAddMenuHtml(){
  return `<div class="keypad-add-menu">
    <button onclick="keypadAddMenuOpen=false;callTab='contacts';callContactView=keypadNumber;callContactEdit=true;renderCalls()"><span>＋</span><b>Opret ny kontakt</b></button>
    <button onclick="showToast('Føj til eksisterende kontakt kommer i næste trin')"><span>▣</span><b>Føj til eksisterende kontakt</b></button>
  </div>`;
}
function toggleKeypadAddMenu(){ keypadAddMenuOpen=!keypadAddMenuOpen; renderKeypad(); }
function updateKeypadView(){
  const num=document.getElementById('keypadNumber'); if(num) num.textContent=keypadNumber;
  const d=document.getElementById('keypadDelete'); if(d) d.classList.toggle('hidden', !keypadNumber);
  const m=document.getElementById('keypadMatches'); if(m) m.innerHTML=keypadMatchesHtml();
}
function keypadPress(n){ keypadAddMenuOpen=false; keypadNumber = String(keypadNumber||'') + String(n); updateKeypadView(); }
function keypadBackspace(){ keypadAddMenuOpen=false; keypadNumber = String(keypadNumber||'').slice(0,-1); updateKeypadView(); }
function renderCallPlaceholder(title,text){ appContent.innerHTML=`<div class="ios-call-screen"><div class="call-safe-fade"></div><h1 class="call-title-main">${esc(title)}</h1><div class="card">${esc(text)}</div>${callBottomBar()}</div>`; }
function startCall(){ const n=(document.getElementById('callNumberInput')?.value || keypadNumber || '').trim(); if(n) nui('startCall',{number:n}); }
function formatCallDate(stamp){ if(!stamp) return ''; const d=new Date(Number(stamp)*1000), now=new Date(); if(d.toDateString()===now.toDateString()) return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; const diff=Math.floor((now-d)/86400000); if(diff===1) return 'i går'; if(diff<7) return ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'][d.getDay()]; return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }
function formatCallFullDate(stamp){ if(!stamp) return ''; const d=new Date(Number(stamp)*1000); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function formatDuration(sec){ sec=Number(sec)||0; const m=Math.floor(sec/60), s=sec%60; return m>0?`${m} min. ${s} sek.`:`${s} sek.`; }
function renderCallContacts(){
  if(callContactView!==null) return renderCallContactCard(callContactView);
  const q=String(callContactSearch||'').toLowerCase().trim();
  const contacts=(DATA.contacts||[]).filter(c=>!q || [c.name,c.number,c.phone_number].join(' ').toLowerCase().includes(q)).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'da'));
  const rerender = contactsStandalone ? 'renderContacts()' : 'renderCalls()';
  let lastLetter='';
  const rows=contacts.map(c=>{ const letter=String(c.name||c.number||'?').charAt(0).toUpperCase(); const head=letter!==lastLetter; lastLetter=letter; return `${head?`<div class="contact-letter">${esc(letter)}</div>`:''}<div class="call-contact-row" onclick="callContactView='${esc(c.number||c.phone_number)}';callContactEdit=false;${rerender}"><b>${esc(c.name)}</b><span>${esc(c.number||c.phone_number||'')}</span></div>`; }).join('');
  appContent.innerHTML=`<div class="ios-call-screen contact-tab-screen ${contactsStandalone?'contacts-standalone-app':''}">
    <div class="call-safe-fade"></div>
    <div class="call-contact-top"><div></div><b>Kontakter</b><button onclick="callContactView='';callContactEdit=true;${rerender}">＋</button></div>
    <input id="callContactSearch" class="ios-call-search" placeholder="Søg" value="${esc(callContactSearch)}">
    <div class="my-card" onclick="callContactView=DATA.number;callContactEdit=false;${rerender}"><div class="self-avatar">${esc(String(DATA.name||'?').charAt(0).toUpperCase())}</div><div class="self-info"><b>${esc(DATA.name||'Min kontakt')}</b><span>Mit kort</span><div class="self-number">${esc(DATA.number||'')}</div></div></div>
    <div class="call-contact-list">${rows||'<div class="ios-empty">Ingen kontakter.</div>'}</div>
    ${contactsStandalone?'':callBottomBar()}
  </div>`;
  const inp=document.getElementById('callContactSearch'); if(inp){ inp.addEventListener('input',function(){callContactSearch=this.value;renderCallContacts();setTimeout(()=>{const i=document.getElementById('callContactSearch');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},0);}); }
}
function renderCallContactCard(number){
  number = String(number || '').trim();
  const isSelf=String(number)===String(DATA.number);
  const fallbackName = isSelf ? (DATA.name||'Mit kort') : (number || 'Ukendt');
  const c=isSelf ? {name:fallbackName, number:DATA.number, company:'', nickname:'', notes:'Dette er dit personlige kontaktkort.'} : (contactByNumber(number) || {name:fallbackName, number:number, company:'', nickname:'', notes:''});
  const existing=!!contactByNumber(number) || isSelf;
  const rt = contactsStandalone ? 'renderContacts()' : 'renderCalls()';
  const maybeTabbar = contactsStandalone ? '' : callBottomBar();
  const nameParts = String(c.name||'').trim().split(/\s+/).filter(Boolean);
  const editFirst = nameParts.length ? nameParts[0] : '';
  const editLast = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';
  if(callContactEdit){
    const title = existing ? 'Rediger' : 'Ny kontakt';
    appContent.innerHTML=`<div class="ios-call-screen contact-edit-screen v24-edit">
      <div class="v24-edit-bg"></div>
      <div class="v24-edit-header">
        <button class="v24-round-cancel" onclick="callContactEdit=false;${existing?rt:'callContactView=null;'+rt}">×</button>
        <div class="v24-edit-title">${title}</div>
        <button class="v24-round-save" onclick="saveCallContact('${esc(number)}')">✓</button>
      </div>
      <div class="v24-edit-scroll">
        <div class="v24-edit-photo">
          <div class="v24-photo-avatar"><span></span></div>
          <button type="button" onclick="showToast('Kontaktfoto kommer senere')">Tilføj foto</button>
        </div>
        <div class="v24-form-group v24-name-group">
          <input id="editFirst" placeholder="Fornavn" value="${esc(editFirst)}">
          <input id="editLast" placeholder="Efternavn" value="${esc(editLast)}">
          <input id="editCompany" placeholder="Firma" value="${esc(c.company||'')}">
        </div>
        <div id="phoneRows" class="v24-form-group">
          <div class="v24-phone-row"><button type="button" class="v24-minus" onclick="clearEditPhone()">−</button><button type="button" class="v24-type">telefon ›</button><input id="editNumber" placeholder="Telefon" value="${esc(c.number||number||'')}"></div>
          <button type="button" class="v24-add-row" onclick="addFakeEditRow('telefon')"><span>+</span> tilføj telefon</button>
        </div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('e-mail')"><span>+</span> tilføj e-mail</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('pronominer')"><span>+</span> tilføj pronominer</button></div>
        <div class="v24-form-group v24-select-row"><label>Ringetone</label><button type="button" onclick="showToast('Ringetone kommer senere')">Standard ›</button></div>
        <div class="v24-form-group v24-select-row"><label>Beskedtone</label><button type="button" onclick="showToast('Beskedtone kommer senere')">Standard ›</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('url')"><span>+</span> tilføj url</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('adresse')"><span>+</span> tilføj adresse</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('fødselsdag')"><span>+</span> tilføj fødselsdag</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('dato')"><span>+</span> tilføj dato</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('relation')"><span>+</span> tilføj relation</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('social profil')"><span>+</span> tilføj social profil</button></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('chat')"><span>+</span> tilføj chat</button></div>
        <div class="v24-form-group"><textarea id="editNotes" placeholder="Noter">${esc(c.notes||'')}</textarea></div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="addFakeEditRow('bekræftelseskode')"><span>+</span> tilføj bekræftelseskode</button></div>
        <div class="v24-form-group"><button type="button" class="v24-field-btn" onclick="showToast('Tilføj felt kommer senere')">tilføj felt</button></div>
        <div class="v24-section-label">Forbundne kontakter</div>
        <div class="v24-form-group"><button type="button" class="v24-add-row" onclick="showToast('Forbundne kontakter kommer senere')"><span>+</span> forbind med kontakter...</button></div>
        ${existing && !isSelf ? `<div class="v24-form-group"><button type="button" class="v24-delete-contact" onclick="deleteCallContact('${esc(c.number||number)}')">Slet kontakt</button></div>` : ''}
      </div>
      ${maybeTabbar}
    </div>`;
    return;
  }
  const displayName = c.name || c.number || number || 'Ukendt';
  const displayNumber = c.number || number || '';
  const initials = String(displayName||'?').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || '?';
  appContent.innerHTML=`<div class="ios-call-screen call-contact-card-screen">
    <div class="call-safe-fade"></div>
    <div class="call-contact-top"><button class="circle-back" onclick="callContactView=null;${rt}">‹</button><b></b>${!isSelf?`<button class="edit-contact-btn" onclick="callContactEdit=true;${rt}">Rediger</button>`:'<div></div>'}</div>
    <div class="call-contact-card-scroll apple-contact-detail">
      <div class="apple-contact-hero">
        <div class="contact-large-avatar apple-avatar">${esc(initials)}</div>
        <div class="apple-contact-name">${esc(displayName)}</div>
        <div class="apple-contact-number">${esc(displayNumber)}</div>
        <div class="apple-contact-actions ios-real-actions">
          <button title="Besked" onclick="activeApp='messages';activeConversation=getConversationKeyForNumber('${esc(displayNumber)}');renderMessages()"><img src="img/contact_icons/message.png" alt="Besked"></button>
          <button title="Ring" onclick="nui('startCall',{number:'${esc(displayNumber)}'})"><img src="img/contact_icons/phone.png" alt="Ring"></button>
          <button title="Video ikke tilgængelig" class="disabled unavailable" disabled><img src="img/contact_icons/video.png" alt="Video"></button>
          <button title="Mail ikke tilgængelig" class="disabled unavailable" disabled><img src="img/contact_icons/mail.png" alt="Mail"></button>
        </div>
      </div>
      <button class="poster-card" onclick="showToast('Kontaktfoto og plakat kommer senere')"><div class="poster-mini">${esc(initials)}</div><span>Kontaktfoto og plakat</span><b>›</b></button>
      <div class="apple-info-card"><label>mobil</label><div>${esc(displayNumber || 'Intet nummer')}</div><button onclick="nui('startCall',{number:'${esc(displayNumber)}'})">☎</button>${c.notes?`<hr><label>Noter</label><p>${esc(c.notes)}</p>`:`<hr><label>Noter</label><p>Ingen noter</p>`}</div>
      <div class="apple-option-card"><button onclick="activeApp='messages';activeConversation=getConversationKeyForNumber('${esc(displayNumber)}');renderMessages()">Send besked</button><button onclick="showToast('Kontakt delt')">Del kontakt</button><button onclick="toggleContactFlag('${esc(displayNumber)}','favorite')">${contactFlag(displayNumber,'favorite')?'Fjern fra favoritter':'Føj til favoritter'}</button></div>
      <div class="apple-option-card"><button onclick="toggleContactFlag('${esc(displayNumber)}','emergency')">${contactFlag(displayNumber,'emergency')?'Fjern fra nødkontakter':'Føj til nødkontakter'}</button></div>
      ${!isSelf?`<div class="apple-option-card danger"><button onclick="deleteCallContact('${esc(displayNumber)}')">Slet kontakt</button><button onclick="toggleContactFlag('${esc(displayNumber)}','blocked')">${contactFlag(displayNumber,'blocked')?'Fjern blokering af kontakt':'Bloker kontakt'}</button></div>`:''}
    </div>
    ${maybeTabbar}
  </div>`;
}

function deleteCallContact(number){
  if(!number) return;
  showToast('Kontakt slettet');
  DATA.contacts=(DATA.contacts||[]).filter(c=>String(c.number||c.phone_number)!==String(number));
  nui('deleteContact',{number});
  callContactView=null; callContactEdit=false;
  setTimeout(()=>{nui('requestData'); renderCalls();},120);
}

function clearEditPhone(){ const i=document.getElementById('editNumber'); if(i){ i.value=''; i.focus(); } }
function addFakeEditRow(type){
  const label=String(type||'felt');
  const holder=document.createElement('div');
  holder.className='v24-inline-added';
  holder.innerHTML=`<button type="button" class="v24-minus" onclick="this.parentElement.remove()">−</button><input placeholder="${esc(label)}">`;
  const active=document.activeElement;
  const group=active && active.closest ? active.closest('.v24-form-group') : null;
  if(group){ group.appendChild(holder); const inp=holder.querySelector('input'); if(inp) inp.focus(); }
}
function saveCallContact(oldNumber){
  const first=(document.getElementById('editFirst')?.value||'').trim();
  const last=(document.getElementById('editLast')?.value||'').trim();
  const editNumberEl=document.getElementById('editNumber');
  const number=(editNumberEl?.value||oldNumber||'').trim();
  const fullName=(first+' '+last).trim() || number || 'Kontakt';

  if(!number){
    showToast('Indtast et telefonnummer før du gemmer kontakten.');
    if(editNumberEl) editNumberEl.focus();
    return;
  }

  const payload={
    oldNumber: oldNumber || number,
    firstName: first,
    lastName: last,
    name: fullName,
    number: number,
    company: document.getElementById('editCompany')?.value || '',
    nickname: '',
    notes: document.getElementById('editNotes')?.value || ''
  };

  // Opdater lokalt med det samme, så skærmen ikke hopper til "Ukendt" mens SQL gemmer.
  const contacts=DATA.contacts||[];
  const oldClean=String(oldNumber||'').replace(/\s+/g,'');
  const newClean=String(number||'').replace(/\s+/g,'');
  const idx=contacts.findIndex(c=>String(c.number||c.phone_number||'').replace(/\s+/g,'')===oldClean || String(c.number||c.phone_number||'').replace(/\s+/g,'')===newClean);
  const localContact={ name:fullName, number:number, phone_number:number, company:payload.company, nickname:'', notes:payload.notes };
  if(idx>=0) contacts[idx]={...contacts[idx], ...localContact}; else contacts.unshift(localContact);
  DATA.contacts=contacts;

  callContactView=number;
  callContactEdit=false;
  if(contactsStandalone){ renderContacts(); } else { renderCalls(); }
  showToast('Kontakt gemt');
  nui('saveContact',payload);
  setTimeout(()=>nui('requestData'),350);
}
function renderContacts(){
  phone.classList.add('ios-light-app');
  contactsStandalone = true;
  callTab = 'contacts';
  callContactView = callContactView ?? null;
  renderCallContacts();
}
function renderTwitter(){
  phone.classList.add('ios-light-app');
  if(!twitterIntroDone){
    twitterIntroDone = true;
    appContent.innerHTML = `<div class="twitter-screen twitter-splash"><img class="twitter-splash-icon" src="img/icons/twitter.png" onerror="this.src='img/icons/x.png'" alt="Twitter"></div>`;
    setTimeout(()=>renderTwitter(), 2200);
    return;
  }
  if(!DATA.twitterAccount){ return renderTwitterLogin(); }
  if(twitterActivePostId){ return renderTwitterPost(twitterActivePostId); }
  if(twitterComposerOpen){ return renderTwitterCompose(); }
  const posts = (DATA.tweets||[]).slice(0,30);
  appContent.innerHTML = `<div class="twitter-screen">
    <div class="twitter-top"><div><span class="twitter-kicker">VIB CITY</span><h1>Twitter</h1></div><button class="twitter-new" onclick="openTwitterCompose()">＋</button></div>
    <div class="twitter-profile-pill"><b>@${esc(DATA.twitterAccount.username)}</b><span>${esc(DATA.name||DATA.number||'Borger')}</span></div>
    <div class="twitter-feed">${posts.map(twitterCardHtml).join('') || '<div class="twitter-empty">Ingen opslag endnu.</div>'}</div>
  </div>`;
}
function renderTwitterLogin(){
  appContent.innerHTML = `<div class="twitter-screen twitter-login-screen">
    <div class="twitter-login-card">
      <img src="img/icons/twitter.png" onerror="this.src='img/icons/x.png'" alt="Twitter">
      <h1>Velkommen</h1><p>Opret din konto én gang. Dit brugernavn bruges på opslag og kommentarer.</p>
      <input id="twitterUser" placeholder="Username" maxlength="24" autocomplete="off">
      <input id="twitterPass" placeholder="Password" type="password" maxlength="64" autocomplete="off">
      <button onclick="registerTwitter()">Registrer konto</button>
    </div>
  </div>`;
}
function registerTwitter(){
  const username=(document.getElementById('twitterUser')?.value||'').trim().replace(/\s+/g,'_');
  const password=(document.getElementById('twitterPass')?.value||'').trim();
  if(username.length<3){ showToast('Username skal være mindst 3 tegn.'); return; }
  if(password.length<3){ showToast('Password skal være mindst 3 tegn.'); return; }
  DATA.twitterAccount={username};
  renderTwitter();
  nui('twitterRegister',{username,password});
  setTimeout(()=>nui('requestData'),500);
}
function isMyTwitterPost(t){
  if(!t) return false;
  if(DATA.user_id && Number(t.user_id) === Number(DATA.user_id)) return true;
  const me = DATA.twitterAccount && DATA.twitterAccount.username ? String(DATA.twitterAccount.username).toLowerCase() : '';
  return !!me && String(t.username||t.name||'').toLowerCase() === me;
}
function twitterCardHtml(t){
  const comments=(t.comments||[]).length;
  const isMine=isMyTwitterPost(t);
  return `<div class="twitter-card ${isMine?'mine':''}" onclick="openTwitterPost(${Number(t.id)||0})">
    ${isMine?`<button class="twitter-delete-btn" title="Slet opslag" onclick="event.stopPropagation();deleteTwitterPost(${Number(t.id)||0})">🗑</button>`:''}
    <div class="twitter-author"><div class="tw-avatar">${esc(String(t.username||t.name||'?').charAt(0).toUpperCase())}</div><div><b>@${esc(t.username||t.name||'Ukendt')}</b><span>${esc(t.date||t.time||'')}</span></div></div>
    <h2>${esc(t.title||'Opslag')}</h2><p>${esc(t.text||'')}</p>
    ${t.image_url?`<img class="twitter-post-img" src="${esc(t.image_url)}" onerror="this.remove()">`:''}
    <div class="twitter-meta"><span>💬 ${comments} kommentarer</span><span>Tryk for at åbne</span></div>
  </div>`;
}
function deleteTwitterPost(id){
  id=Number(id)||0;
  if(id<=0) return;
  showToast('Opslaget slettes...');
  DATA.tweets=(DATA.tweets||[]).filter(t=>Number(t.id)!==id);
  if(Number(twitterActivePostId)===id) twitterActivePostId=null;
  renderTwitter();
  nui('twitterDeletePost',{postId:id});
  setTimeout(()=>nui('requestData'),500);
}
function openTwitterCompose(){ twitterComposerOpen=true; twitterActivePostId=null; renderTwitter(); }
function closeTwitterCompose(){ twitterComposerOpen=false; renderTwitter(); }
function renderTwitterCompose(){
  appContent.innerHTML = `<div class="twitter-screen twitter-compose-screen">
    <div class="twitter-compose-head"><button onclick="closeTwitterCompose()">Annuller</button><b>Nyt opslag</b><button onclick="submitTwitterPost()">Send</button></div>
    <div class="twitter-compose-card">
      <label>Overskrift</label><input id="twTitle" maxlength="60" placeholder="Hvad handler opslaget om?">
      <label>Tekst</label><textarea id="twText" maxlength="500" placeholder="Skriv dit opslag til byen..."></textarea>
      <label>Billede link</label><input id="twImage" placeholder="Discord media link / image URL">
      <small>Billedlink er valgfrit. Brug direkte Discord media link eller image URL.</small>
    </div>
  </div>`;
}
function submitTwitterPost(){
  const title=(document.getElementById('twTitle')?.value||'').trim();
  const text=(document.getElementById('twText')?.value||'').trim();
  const image=(document.getElementById('twImage')?.value||'').trim();
  if(!title || !text){ showToast('Udfyld overskrift og tekst.'); return; }
  twitterComposerOpen=false;
  showToast('Sender opslag...');
  renderTwitter();
  nui('twitterPost',{title,text,image});
  setTimeout(()=>nui('requestData'),350);
  setTimeout(()=>nui('requestData'),1200);
}
function openTwitterPost(id){ twitterActivePostId=id; twitterCommentText=''; renderTwitter(); }
function closeTwitterPost(){ twitterActivePostId=null; twitterCommentText=''; renderTwitter(); }
function renderTwitterPost(id){
  const t=(DATA.tweets||[]).find(x=>Number(x.id)===Number(id));
  if(!t){ twitterActivePostId=null; return renderTwitter(); }
  const comments=t.comments||[];
  appContent.innerHTML = `<div class="twitter-screen twitter-detail-screen">
    <div class="twitter-detail-head"><button onclick="closeTwitterPost()">‹ Twitter</button><b>Opslag</b><span></span></div>
    <div class="twitter-feed twitter-detail-feed">
      ${twitterCardHtml(t).replace('onclick="openTwitterPost('+Number(t.id)+')"','')}
      <div class="twitter-comments-title">Kommentarer</div>
      ${comments.map(c=>`<div class="twitter-comment"><b>@${esc(c.username||'Ukendt')}</b><span>${esc(c.date||c.time||'')}</span><p>${esc(c.text||'')}</p></div>`).join('') || '<div class="twitter-empty small-empty">Ingen kommentarer endnu.</div>'}
    </div>
    <div class="twitter-comment-bar"><input id="twComment" placeholder="Skriv kommentar..."><button onclick="submitTwitterComment(${Number(id)})">Send</button></div>
  </div>`;
  const inp=document.getElementById('twComment');
  if(inp){ inp.value=twitterCommentText; inp.addEventListener('input',()=>twitterCommentText=inp.value); inp.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); submitTwitterComment(id); }}); }
}
function submitTwitterComment(id){
  const input=document.getElementById('twComment');
  const text=(input?.value||'').trim();
  if(!text) return;
  twitterCommentText=''; if(input) input.value='';
  showToast('Sender kommentar...');
  nui('twitterComment',{postId:id,text});
  setTimeout(()=>nui('requestData'),350);
  setTimeout(()=>nui('requestData'),1200);
  setTimeout(()=>nui('requestData'),500);
}
function tweet(){ const t=document.getElementById('tweetText')?.value||''; if(t.trim()) nui('twitterPost',{title:'By-opslag',text:t,image:''}); }
function renderSettings(page){
  phone.classList.remove('keypad-mode');
  phone.classList.add('ios-light-app');
  applyPhoneAppearance();
  settingsPage = page || settingsPage || 'main';
  const currentWp = Number(DATA.settings?.wallpaper || 1);
  const dark = vibSettings.appearance === 'dark';
  const carplay = (DATA.inVehicle === true || vibSettings.carPlayConnected === true);
  const toggle = (key)=>`<button class="ios-switch ${vibSettings[key]?'on':''}" onclick="toggleVibSetting('${key}')"><span></span></button>`;
  const slider = (key,min,max,step)=>{ const val=Number(vibSettings[key]||0); const pct=Math.max(0,Math.min(100,((val-Number(min))/(Number(max)-Number(min)))*100)); return `<input class="ios-range" type="range" min="${min}" max="${max}" step="${step}" value="${esc(vibSettings[key])}" style="--range-fill:${pct}%" oninput="setVibSlider('${key}',this.value)" onchange="setVibSlider('${key}',this.value)">`; };
  const chevron = '<span class="settings-chevron">›</span>';
  const icon = (content, cls='blue') => `<span class="settings-icon ${cls}">${content}</span>`;
  const row = (ic, cls, title, sub, target, right='') => `<button class="settings-row" onclick="settingsOpen('${target}')">${icon(ic,cls)}<span class="settings-row-text"><b>${title}</b>${sub?`<small>${sub}</small>`:''}</span>${right||chevron}</button>`;
  const appRow = (key,title,sub,target) => `<button class="settings-row" onclick="settingsOpen('${target}')"><span class="settings-icon appicon">${appIconHtml(key)}</span><span class="settings-row-text"><b>${title}</b>${sub?`<small>${sub}</small>`:''}</span>${chevron}</button>`;
  const screen = (head, body) => `<div class="settings-screen"><div class="settings-subhead"><button onclick="settingsBack()">‹ Indstillinger</button><b>${head}</b><span></span></div><div class="settings-scroll sub">${body}</div></div>`;
  const info = (a,b) => `<div class="settings-info-row"><b>${a}</b><span>${b}</span></div>`;
  if(settingsPage==='main'){
    appContent.innerHTML = `<div class="settings-screen">
      <div class="settings-scroll main">
        <h1 class="settings-title">Indstillinger</h1>
        <div class="settings-search"><span>⌕</span><input placeholder="Søg" onfocus="nui('typing',{typing:true})" onblur="nui('typing',{typing:false})"></div>
        <button class="settings-apple-card" onclick="settingsOpen('profile')">
          <div class="settings-avatar">${esc(String(DATA.name||'B').charAt(0).toUpperCase())}</div>
          <div><b>${esc(DATA.name||'Borger')}</b><small>Apple-konto, iCloud, medier og køb</small></div><span>›</span>
        </button>
        <div class="settings-group">
          ${row('✈','orange','Flyfunktion','Ikke aktiv','airplane', toggle('airplane'))}
          ${row('📶','blue','Wi‑Fi',vibSettings.wifi?'VIB Network':'Fra','wifi')}
          ${row('⌘','blue','Bluetooth',carplay?'Apple CarPlay':'Til','bluetooth')}
          ${row('▥','green','Mobilnetværk','5G','network')}
        </div>
        <div class="settings-group">
          ${row('🔔','red','Notifikationer', vibSettings.notifications?'Til':'Fra', 'notifications')}
          ${row('🔊','pink','Lyde & haptisk feedback', vibSettings.sound?'Standard':'Slået fra', 'sounds')}
          ${row('☾','purple','Fokus','Ikke aktiv','focus')}
          ${row('⌛','purple','Skærmtid','Telefonaktivitet','screentime')}
        </div>
        <div class="settings-group">
          ${row('🖼','cyan','Baggrund','Vælg mellem 6 baggrunde','wallpaper')}
          ${row('☀','blue','Skærm & lysstyrke', dark?'Mørk':'Lys','display')}
          ${row('⌂','blue','Hjemmeskærm','Apps og badges','homescreen')}
        </div>
        <div class="settings-group">
          ${appRow('camera','Kamera','Grid, Live og preview','camera')}
          ${appRow('photos','Fotos','Bibliotek, samlinger og valg','photos')}
          ${appRow('twitter','Twitter','Konto og notifikationer','twitter')}
          ${appRow('message','Beskeder','Forhåndsvisning og lyde','messages')}
          ${appRow('calls','Telefon','Nummer og opkald','phone')}
        </div>
      </div>
    </div>`;
    return;
  }
  if(settingsPage==='profile'){
    appContent.innerHTML = screen('Apple-konto', `<div class="settings-profile-large"><div class="settings-avatar big">${esc(String(DATA.name||'B').charAt(0).toUpperCase())}</div><h2>${esc(DATA.name||'Borger')}</h2><p>${esc(DATA.number||'Intet nummer')}</p></div><div class="settings-group">${info('Navn',esc(DATA.name||'Borger'))}${info('Telefonnummer',esc(DATA.number||'Ukendt'))}${info('iCloud','Aktiv')}${info('Server','VIB Phone')}</div>`); return;
  }
  if(settingsPage==='display'){
    appContent.innerHTML = screen('Skærm & lysstyrke', `<h2 class="settings-section-title">UDSEENDE</h2><div class="appearance-grid"><button class="appearance-card ${!dark?'active':''}" onclick="setVibSetting('appearance','light')"><span class="preview light"></span><b>Lys</b></button><button class="appearance-card ${dark?'active':''}" onclick="setVibSetting('appearance','dark')"><span class="preview dark"></span><b>Mørk</b></button></div><div class="settings-group"><div class="settings-toggle-row"><div><b>Automatisk lysstyrke</b><small>Tilpasser UI'et visuelt</small></div>${toggle('autoBrightness')}</div><div class="settings-range-row"><b>Lysstyrke</b>${slider('brightness',45,100,1)}</div><div class="settings-info-row"><b>Tekststørrelse</b><span>${esc(vibSettings.textSize||'Normal')}</span></div></div>`); return;
  }
  if(settingsPage==='wifi'){
    appContent.innerHTML = screen('Wi‑Fi', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Wi‑Fi</b><small>${vibSettings.wifi?'Til':'Fra'}</small></div>${toggle('wifi')}</div></div><h2 class="settings-section-title small">MIT NETVÆRK</h2><div class="settings-group">${info('VIB Network','Forbundet')}${info('IP-adresse','192.168.58.'+String(DATA.number||'001').slice(-3))}${info('Router','VIB‑RP Gateway')}${info('Sikkerhed','WPA3 Personlig')}${info('Signal','Stærkt')}</div><div class="settings-caption">Wi‑Fi er visuelt i telefonen og bruges til at give apps et realistisk iOS-layout.</div>`); return;
  }
  if(settingsPage==='bluetooth'){
    appContent.innerHTML = screen('Bluetooth', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Bluetooth</b><small>${vibSettings.bluetooth?'Til':'Fra'}</small></div>${toggle('bluetooth')}</div></div><h2 class="settings-section-title small">MINE ENHEDER</h2><div class="settings-group">${carplay?`${info('Apple CarPlay','Forbundet')}${info('Køretøj','Aktivt køretøj')}`:`<div class="settings-empty-device">Ingen enheder forbundet</div>`}</div><div class="settings-caption">Når spilleren sidder i et køretøj, vises Apple CarPlay automatisk som forbundet.</div>`); return;
  }
  if(settingsPage==='network'){
    appContent.innerHTML = screen('Mobilnetværk', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Mobildata</b><small>5G</small></div>${toggle('cellular')}</div>${info('Operatør','VIB Mobile')}${info('Dataforbindelse','5G Auto')}${info('Signal','Fuldt signal')}${info('Roaming','Fra')}</div>`); return;
  }
  if(settingsPage==='airplane'){
    appContent.innerHTML = screen('Flyfunktion', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Flyfunktion</b><small>${vibSettings.airplane?'Aktiv':'Ikke aktiv'}</small></div>${toggle('airplane')}</div></div><div class="settings-caption">Kommer til at kunne slå telefonens visuelle forbindelser fra i en senere version.</div>`); return;
  }
  if(settingsPage==='wallpaper'){
    appContent.innerHTML = screen('Baggrund', `<h2 class="settings-section-title">Vælg baggrund</h2><div class="settings-wallpaper-grid">${[1,2,3,4,5,6].map(i=>`<button class="settings-wallpaper ${currentWp===i?'active':''}" style="background:var(--wp${i})" onclick="settingsToggleWallpaper(${i})"><span>${currentWp===i?'✓':''}</span></button>`).join('')}</div>`); return;
  }
  if(settingsPage==='notifications'){
    appContent.innerHTML = screen('Notifikationer', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Tillad notifikationer</b><small>Beskeder, Twitter og opkald</small></div>${toggle('notifications')}</div><div class="settings-toggle-row"><div><b>Forhåndsvisning</b><small>Vis tekst i toppen af telefonen</small></div>${toggle('messagePreview')}</div><div class="settings-toggle-row"><div><b>Badges</b><small>Vis røde tællere på apps</small></div>${toggle('appBadges')}</div><div class="settings-toggle-row"><div><b>Twitter</b><small>Nye opslag og kommentarer</small></div>${toggle('twitterNotifications')}</div></div>`); return;
  }
  if(settingsPage==='sounds'){
    appContent.innerHTML = screen('Lyde & haptisk feedback', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Lyde</b><small>${vibSettings.sound?'Standard':'Slået fra'}</small></div>${toggle('sound')}</div><div class="settings-toggle-row"><div><b>Systemhaptik</b><small>Tryk og knapper</small></div>${toggle('haptics')}</div>${info('Ringetone','Standard')}${info('Beskedtone','Note')}</div>`); return;
  }
  if(settingsPage==='focus'){
    appContent.innerHTML = screen('Fokus', `<div class="settings-group">${info('Forstyr ikke','Fra')}${info('Personlig','Ikke konfigureret')}${info('Arbejde','Ikke konfigureret')}</div>`); return;
  }
  if(settingsPage==='screentime'){
    appContent.innerHTML = screen('Skærmtid', `<div class="settings-group">${info('Aktivitet i dag','Telefonen er aktiv')}${info('Mest brugt','Fotos og Beskeder')}${info('App-grænser','Fra')}</div>`); return;
  }
  if(settingsPage==='homescreen'){
    appContent.innerHTML = screen('Hjemmeskærm', `<div class="settings-group"><div class="settings-toggle-row"><div><b>App-badges</b><small>Røde tællere på ikoner</small></div>${toggle('appBadges')}</div>${info('Layout','Standard')}${info('Dock','4 apps')}</div>`); return;
  }
  if(settingsPage==='camera'){
    appContent.innerHTML = screen('Kamera', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Grid</b><small>Vis hjælpelinjer i kameraet</small></div>${toggle('cameraGrid')}</div><div class="settings-toggle-row"><div><b>Live-indikator</b><small>Vis Live-knappen i kameraet</small></div>${toggle('cameraLive')}</div>${info('Format','Lodret 9:16')}${info('Gem til','Fotos')}</div><div class="settings-caption">Kameraet gemmer billeder i lodret format, så de passer til Fotos, Beskeder og Twitter.</div>`); return;
  }
  if(settingsPage==='photos'){
    appContent.innerHTML = screen('Fotos', `<div class="settings-group"><button class="settings-row" onclick="openApp('photos')"><span class="settings-icon appicon">${appIconHtml('photos')}</span><span class="settings-row-text"><b>Åbn Fotos</b><small>Bibliotek og Samlinger</small></span>${chevron}</button><div class="settings-toggle-row"><div><b>Tryk-effekter</b><small>iOS-lignende hover og press</small></div>${toggle('photosHaptics')}</div>${info('Billeder',(DATA.photos||[]).length+' emner')}${info('Samlinger','Aktiv')}</div>`); return;
  }
  if(settingsPage==='twitter'){
    const acc = DATA.twitterAccount;
    appContent.innerHTML = screen('Twitter', `<div class="settings-group">${info('Konto',esc(acc?('@'+acc.username):'Ikke oprettet'))}<div class="settings-toggle-row"><div><b>Notifikationer</b><small>Nye opslag og kommentarer</small></div>${toggle('twitterNotifications')}</div><button class="settings-row" onclick="openApp('twitter')"><span class="settings-icon appicon">${appIconHtml('twitter')}</span><span class="settings-row-text"><b>Åbn Twitter</b><small>Profil, opslag og kommentarer</small></span>${chevron}</button></div>`); return;
  }
  if(settingsPage==='messages'){
    appContent.innerHTML = screen('Beskeder', `<div class="settings-group"><div class="settings-toggle-row"><div><b>Forhåndsvisning</b><small>Vis 1-2 linjer i notifikationer</small></div>${toggle('messagePreview')}</div><button class="settings-row" onclick="openApp('messages')"><span class="settings-icon appicon">${appIconHtml('message')}</span><span class="settings-row-text"><b>Åbn Beskeder</b><small>Chats og kontakter</small></span>${chevron}</button></div>`); return;
  }
  if(settingsPage==='phone'){
    appContent.innerHTML = screen('Telefon', `<div class="settings-group">${info('Mit nummer',esc(DATA.number||'Ukendt'))}${info('Seneste opkald',(DATA.callLogs||[]).length)}<button class="settings-row" onclick="openApp('calls')"><span class="settings-icon appicon">${appIconHtml('calls')}</span><span class="settings-row-text"><b>Åbn Telefon</b><small>Seneste, kontakter og numerisk blok</small></span>${chevron}</button></div>`); return;
  }
  appContent.innerHTML = screen(settingsPage, `<div class="settings-group">${info('Kommer senere','Klar til opdatering')}</div>`);
  setTimeout(hydrateRanges,0);
}

let cameraLoadedOnce = false;
let cameraFacing = 'back';
let cameraZoom = 1;
let cameraFlash = false;
let cameraControlsOpen = false;
let cameraGrid = true;
let cameraLive = true;
let cameraNativeStarted = false;
let photosGridCols = 3;
let photosSortMode = 'added';
let photosFilterMode = 'all';
let photosSelectMode = false;
let photosSelected = new Set();
let photosMenuOpen = false;
let photosMoreOpen = false;
let photosMenuPanel = 'main';
let photosHidden = new Set(JSON.parse(localStorage.getItem('vib_photos_hidden')||'[]'));
let photosFavorites = new Set(JSON.parse(localStorage.getItem('vib_photos_favorites')||'[]'));
let photosSelfies = new Set(JSON.parse(localStorage.getItem('vib_photos_selfies')||'[]'));
let photosRecentlyDeleted = []; // nulstilles ved resource/server genstart, ligesom ønsket
let photosAlbumModalOpen = false;
let photosAlbumDraft = '';
let photosAlbumPickerOpen = false;
let photosAlbumPickId = null;
let photosAlbumPickerNewName = '';
let photosAlbums = JSON.parse(localStorage.getItem('vib_photos_albums')||'[]');
let activeCollection = null;
let photosScrollPos = null;
let photosDidInitialScroll = false;
let photosSearchOpen = false;
let photosSearchQuery = '';
let photosTab = 'library';
let photosViewOverlay = true;
let photosInfoOpen = false;
let photosActionOpen = false;

function persistPhotoState(){
  localStorage.setItem('vib_photos_hidden', JSON.stringify([...photosHidden]));
  localStorage.setItem('vib_photos_favorites', JSON.stringify([...photosFavorites]));
  localStorage.setItem('vib_photos_selfies', JSON.stringify([...photosSelfies]));
  localStorage.setItem('vib_photos_albums', JSON.stringify(photosAlbums||[]));
}
function normalizePhotoAlbums(){
  photosAlbums = (photosAlbums||[]).map(a=>({id:a.id||('album_'+Date.now()), title:a.title||'Album', ids:(a.ids||[]).map(Number)}));
  return photosAlbums;
}
function addPhotoAlbum(){
  photosAlbumModalOpen = true;
  photosAlbumDraft = '';
  renderPhotos(null,true);
}
function closePhotoAlbumModal(){ photosAlbumModalOpen=false; photosAlbumDraft=''; renderPhotos(null,true); }
function savePhotoAlbumModal(){
  const input=document.getElementById('newAlbumName');
  const name=(input?input.value:photosAlbumDraft||'').trim();
  if(!name){ showToast('Skriv et navn til albummet.'); return; }
  normalizePhotoAlbums().push({id:'album_'+Date.now(), title:name.substring(0,40), ids:[]});
  persistPhotoState();
  photosAlbumModalOpen=false; photosAlbumDraft='';
  renderPhotos(null,true);
}
function closePhotoAlbumPicker(){ photosAlbumPickerOpen=false; photosAlbumPickId=null; photosAlbumPickerNewName=''; renderPhotos(photosAlbumPickId||null,true); }
function pickPhotoAlbum(albumId){
  normalizePhotoAlbums();
  const id=Number(photosAlbumPickId);
  const album=photosAlbums.find(a=>String(a.id)===String(albumId));
  if(!id || !album){ showToast('Albummet blev ikke fundet.'); return; }
  album.ids=album.ids||[];
  if(!album.ids.map(Number).includes(id)) album.ids.push(id);
  persistPhotoState();
  photosAlbumPickerOpen=false; photosAlbumPickId=null; photosAlbumPickerNewName=''; photosActionOpen=false;
  showToast('Føjet til album');
  renderPhotos(id,true);
}
function createAlbumForPhoto(){
  const input=document.getElementById('albumPickerNewName');
  const name=(input?input.value:'').trim();
  if(!name){ showToast('Skriv et albumnavn.'); return; }
  normalizePhotoAlbums();
  const album={id:'album_'+Date.now(), title:name.substring(0,40), ids:[]};
  photosAlbums.push(album);
  persistPhotoState();
  pickPhotoAlbum(album.id);
}
function photoAlbumModalHtml(){
  if(photosAlbumPickerOpen){
    normalizePhotoAlbums();
    return `<div class="photo-album-modal-backdrop" onclick="if(event.target===this)closePhotoAlbumPicker()">
      <div class="photo-album-picker" onclick="event.stopPropagation()">
        <div class="photo-album-picker-head"><button onclick="closePhotoAlbumPicker()">Annuller</button><b>Føj til album</b><span></span></div>
        <div class="photo-album-picker-list">
          ${photosAlbums.length ? photosAlbums.map(a=>`<button onclick="pickPhotoAlbum('${esc(a.id)}')"><span>${esc(a.title)}</span><small>${(a.ids||[]).length} emner</small><b>›</b></button>`).join('') : '<p class="album-empty">Ingen albummer endnu.</p>'}
        </div>
        <div class="photo-album-picker-new"><input id="albumPickerNewName" placeholder="Nyt albumnavn" maxlength="40"><button onclick="createAlbumForPhoto()">Opret og tilføj</button></div>
      </div>
    </div>`;
  }
  if(!photosAlbumModalOpen) return '';
  return `<div class="photo-album-modal-backdrop" onclick="if(event.target===this)closePhotoAlbumModal()">
    <div class="photo-album-modal">
      <h3>Nyt album</h3>
      <p>Giv albummet et navn.</p>
      <input id="newAlbumName" placeholder="Albumnavn" maxlength="40" autofocus>
      <div><button onclick="closePhotoAlbumModal()">Annuller</button><button onclick="savePhotoAlbumModal()">Opret</button></div>
    </div>
  </div>`;
}
function addPhotoToAlbum(id){
  photosAlbumPickId = Number(id);
  photosAlbumPickerOpen = true;
  photosAlbumPickerNewName = '';
  photosActionOpen = false;
  photosViewOverlay = true;
  renderPhotos(id,true);
}
function collectionPhotos(kind){
  const all=(DATA.photos||[]).slice();
  if(kind==='hidden') return all.filter(p=>photosHidden.has(Number(p.id)));
  if(kind==='deleted') return photosRecentlyDeleted||[];
  if(kind==='favorites') return all.filter(p=>photosFavorites.has(Number(p.id)) || p.favorite===true || Number(p.favorite)===1);
  if(kind==='selfies') return all.filter(p=>photosSelfies.has(Number(p.id)) || p.facing==='front' || p.selfie===true || Number(p.selfie)===1);
  if(kind && String(kind).indexOf('album:')===0){ const a=normalizePhotoAlbums().find(x=>x.id===String(kind).slice(6)); return a ? all.filter(p=>a.ids.includes(Number(p.id))) : []; }
  if(kind==='twitter') return all.filter(p=>p.shared===true || p.source==='twitter' || Number(p.shared_with_you)===1);
  return all.filter(p=>!photosHidden.has(Number(p.id)));
}
function openCollectionLibrary(kind){
  activeCollection = kind || null;
  photosTab='library'; photosSelectMode=false; photosSelected.clear(); photosMenuOpen=false; photosMoreOpen=false; photosDidInitialScroll=false;
  renderPhotos(null,false);
}
function collectionTitle(kind){
  if(!kind) return 'Bibliotek';
  if(kind==='favorites') return 'Favoritter'; if(kind==='hidden') return 'Skjult'; if(kind==='deleted') return 'Slettet for nylig'; if(kind==='selfies') return 'Selfies'; if(kind==='twitter') return 'Twitter';
  if(String(kind).indexOf('album:')===0){ const a=normalizePhotoAlbums().find(x=>x.id===String(kind).slice(6)); return a?a.title:'Album'; }
  return 'Bibliotek';
}
function deletePhotoIds(ids){
  ids=(ids||[]).map(Number).filter(Boolean);
  if(!ids.length) return;
  const now=Math.floor(Date.now()/1000);
  const removed=(DATA.photos||[]).filter(p=>ids.includes(Number(p.id))).map(p=>({...p, deleted_at:now}));
  photosRecentlyDeleted = removed.concat(photosRecentlyDeleted||[]).slice(0,80);
  DATA.photos=(DATA.photos||[]).filter(p=>!ids.includes(Number(p.id)));
  ids.forEach(id=>{ photosFavorites.delete(id); photosHidden.delete(id); photosSelfies.delete(id); });
  normalizePhotoAlbums().forEach(a=>a.ids=(a.ids||[]).filter(id=>!ids.includes(Number(id))));
  persistPhotoState();
  nui('deletePhotos',{ids});
}
function restoreDeletedPhoto(id){
  id=Number(id);
  const p=(photosRecentlyDeleted||[]).find(x=>Number(x.id)===id);
  if(!p){ showToast('Billedet kunne ikke gendannes.'); return; }
  photosRecentlyDeleted=(photosRecentlyDeleted||[]).filter(x=>Number(x.id)!==id);
  const restored={...p, id:Date.now(), created_at:p.created_at||Math.floor(Date.now()/1000)};
  delete restored.deleted_at;
  DATA.photos=DATA.photos||[];
  DATA.photos.unshift(restored);
  if(photoImg(restored)) nui('cameraSaveCroppedPhoto',{image:photoImg(restored)});
  showToast('Billedet er gendannet.');
  photosActionOpen=false; photosInfoOpen=false; photosViewOverlay=true;
  renderPhotos(null,true);
}
function unhidePhoto(id){
  photosHidden.delete(Number(id));
  persistPhotoState();
  showToast('Billedet vises igen i Bibliotek.');
  photosActionOpen=false; photosInfoOpen=false; photosViewOverlay=true;
  renderPhotos(null,true);
}

function cameraNativeEnter(){ if(!cameraNativeStarted){ cameraNativeStarted=true; nui('cameraEnter',{facing:cameraFacing,zoom:cameraZoom}); } }
function cameraNativeExit(){ if(cameraNativeStarted){ cameraNativeStarted=false; nui('cameraExit'); } }

function latestPhoto(){ return (DATA.photos||[])[0] || null; }
function cameraIconSrc(){ return 'img/icons/camera.png'; }
function renderCamera(){
  phone.classList.add('camera-active');
  phone.classList.remove('ios-light-app');
  cameraZoom = 1;
  const latest = latestPhoto();
  appContent.innerHTML=`
    <div class="ios-camera-screen ${cameraLoadedOnce?'camera-ready':''}">
      <div class="camera-launch ${cameraLoadedOnce?'hidden':''}"><img src="${cameraIconSrc()}" onerror="this.src='img/icons/kamera.png'"></div>
      <div class="camera-topbar">
        <button class="cam-icon-btn ${cameraFlash?'active':''}" onclick="cameraFlash=!cameraFlash;renderCamera()" title="Blitz">⚡</button>
        <button class="cam-chevron ${cameraControlsOpen?'open':''}" onclick="cameraControlsOpen=!cameraControlsOpen;renderCamera()">⌃</button>
        <button class="cam-live-btn ${cameraLive?'active':''}" onclick="cameraExitToHome()">Luk</button>
      </div>
      ${cameraControlsOpen?`<div class="camera-extra-controls">
        <button onclick="cameraFlash=!cameraFlash;renderCamera()"><b>⚡</b><span>${cameraFlash?'Blitz til':'Blitz fra'}</span></button>
        <button onclick="showToast('Timer kommer senere')"><b>⏱</b><span>Timer</span></button>
        <button onclick="cameraGrid=!cameraGrid;renderCamera()"><b>▦</b><span>${cameraGrid?'Grid til':'Grid fra'}</span></button>
        <button onclick="showToast('Eksponering kommer senere')"><b>±</b><span>Eksponering</span></button>
      </div>`:''}
      <div class="camera-preview ${cameraFacing==='front'?'front':''}" onclick="cameraFocus(event)">
        <div class="camera-live-sim"></div>
        ${cameraGrid?'<div class="camera-grid-lines"></div>':''}
        <div class="camera-preview-vignette"></div>
        <div id="cameraFocusBox" class="camera-focus-box"></div>
        <div class="camera-zoom-pill">1×</div>
      </div>
      <div class="camera-bottom-panel">
        <div class="camera-modes"><span>VIDEO</span><span class="active">FOTO</span><span>PORTRÆT</span></div>
        <div class="camera-controls-row">
          <button class="camera-thumb ${latest?'has-photo':''}" onclick="openLatestPhoto()">${latest?`<img src="${esc(latest.image||latest.image_data||'')}" onerror="this.parentElement.classList.remove('has-photo');this.remove()">`:'<span></span>'}</button>
          <button class="camera-shutter" onclick="takeCameraPhoto()"><span></span></button>
          <button class="camera-flip" onclick="cameraFacing=cameraFacing==='back'?'front':'back';nui('cameraSetState',{facing:cameraFacing,zoom:1,flash:cameraFlash});renderCamera()"><span>↻</span></button>
        </div>
      </div>
      <div id="cameraFlashOverlay" class="camera-flash-overlay"></div>
    </div>`;
  cameraNativeEnter();
  nui('cameraSetState',{facing:cameraFacing,zoom:cameraZoom,flash:cameraFlash});
  if(!cameraLoadedOnce){
    setTimeout(()=>{ cameraLoadedOnce=true; if(activeApp==='camera') renderCamera(); }, 2050);
  }
}
function cameraExitToHome(){
  cameraNativeExit();
  backHome();
}
function cameraFocus(ev){
  const box=document.getElementById('cameraFocusBox');
  const preview=ev.currentTarget;
  if(!box || !preview) return;
  const r=preview.getBoundingClientRect();
  const x=ev.clientX-r.left, y=ev.clientY-r.top;
  box.style.left=x+'px'; box.style.top=y+'px'; box.classList.remove('pulse'); void box.offsetWidth; box.classList.add('pulse');
}
function takeCameraPhoto(){
  const btn=document.querySelector('.camera-shutter'); if(btn) btn.classList.add('taking');
  const flash=document.getElementById('cameraFlashOverlay'); if(flash){ flash.classList.add('show'); setTimeout(()=>flash.classList.remove('show'),130); }
  setTimeout(()=>{ if(btn) btn.classList.remove('taking'); },240);
  nui('cameraTakePhoto',{facing:cameraFacing,zoom:1,flash:cameraFlash});
  setTimeout(()=>nui('requestData'),750);
  setTimeout(()=>nui('requestData'),1700);
}
function openLatestPhoto(){
  const p=latestPhoto();
  if(!p){ showToast('Ingen billeder endnu.'); return; }
  activeApp='photos';
  renderPhotos(p.id);
}
function photoImg(p){ return p && (p.image || p.image_data || '') || ''; }
function filteredPhotos(){
  let photos=activeCollection ? collectionPhotos(activeCollection).slice() : (DATA.photos||[]).slice();
  if(!activeCollection) photos=photos.filter(p=>!photosHidden.has(Number(p.id)));
  if(photosFilterMode==='favorites') photos=photos.filter(p=>photosFavorites.has(Number(p.id)) || p.favorite===true || Number(p.favorite)===1);
  if(photosFilterMode==='shared') photos=photos.filter(p=>p.shared===true || Number(p.shared)===1 || p.shared_with_you===true || Number(p.shared_with_you)===1);
  const q=String(photosSearchQuery||'').toLowerCase().trim();
  if(q){
    photos=photos.filter(p=>{
      const hay=[p.id,p.date,p.time,p.created_at,p.taken_at,p.stamp].map(x=>String(x||'')).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  photos.sort((a,b)=>{
    const av=photosSortMode==='taken' ? (Number(a.taken_at||a.created_at||a.stamp||0)) : (Number(a.created_at||a.stamp||a.id||0));
    const bv=photosSortMode==='taken' ? (Number(b.taken_at||b.created_at||b.stamp||0)) : (Number(b.created_at||b.stamp||b.id||0));
    return av-bv; // V53: ældste øverst, nyeste nederst som i Apple Fotos
  });
  return photos;
}
function photosMenuHtml(){
  if(photosMenuPanel==='filter'){
    return `<div class="photos-popover photos-popover-sub">
      <button onclick="photosMenuPanel='main';renderPhotos()"><span>‹ Filtrer</span><b></b></button>
      <em></em>
      <button onclick="photosFilterMode='all';photosMenuOpen=false;photosMenuPanel='main';renderPhotos()"><span>Alle elementer</span><b>${photosFilterMode==='all'?'✓':''}</b></button>
      <button onclick="photosFilterMode='favorites';photosMenuOpen=false;photosMenuPanel='main';renderPhotos()"><span>Favoritter</span><b>${photosFilterMode==='favorites'?'✓':''}</b></button>
      <button onclick="photosFilterMode='shared';photosMenuOpen=false;photosMenuPanel='main';renderPhotos()"><span>Delt med dig</span><b>${photosFilterMode==='shared'?'✓':''}</b></button>
    </div>`;
  }
  if(photosMenuPanel==='view'){
    return `<div class="photos-popover photos-popover-sub">
      <button onclick="photosMenuPanel='main';renderPhotos()"><span>‹ Oversigtsvalg</span><b></b></button>
      <em></em>
      <button onclick="photosGridCols=Math.max(2,photosGridCols-1);renderPhotos()"><span>Zoom ind</span><b>${photosGridCols<=2?'✓':''}</b></button>
      <button onclick="photosGridCols=Math.min(5,photosGridCols+1);renderPhotos()"><span>Zoom ud</span><b>${photosGridCols>=5?'✓':''}</b></button>
      <button onclick="photosGridCols=3;renderPhotos()"><span>Standardvisning</span><b>${photosGridCols===3?'✓':''}</b></button>
    </div>`;
  }
  return `<div class="photos-popover">
    <button onclick="photosSortMode='added';photosMenuOpen=false;photosMenuPanel='main';renderPhotos()"><span>Sorter efter<br>senest tilføjet</span><b>${photosSortMode==='added'?'✓':''}</b></button>
    <button onclick="photosSortMode='taken';photosMenuOpen=false;photosMenuPanel='main';renderPhotos()"><span>Sorter efter dato taget</span><b>${photosSortMode==='taken'?'✓':''}</b></button>
    <em></em>
    <button onclick="photosMenuPanel='filter';renderPhotos()"><span>Filtrer</span><b>›</b></button>
    <button onclick="photosMenuPanel='view';renderPhotos()"><span>Oversigtsvalg</span><b>›</b></button>
  </div>`;
}
function photosSelectionMenuHtml(){
  return `<div class="photos-select-popover">
    <button onclick="showToast('Del kommer når vi kobler billeddeling på Beskeder/Twitter.')">Del</button>
    <button class="danger" onclick="deleteSelectedPhotos()">Slet</button>
    <button onclick="hideSelectedPhotos()">Skjul</button>
  </div>`;
}

function photoDetailDate(p){
  if(p.date) return String(p.date);
  const stamp=Number(p.created_at||p.taken_at||p.stamp||0);
  if(!stamp) return '';
  const d=new Date(stamp*1000);
  const dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0'), yy=d.getFullYear();
  const hh=String(d.getHours()).padStart(2,'0'), mi=String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}
function currentPhotoListForViewer(){ return filteredPhotos(); }
function setPhotosTab(tab){ photosTab=tab; activeCollection=null; photosMenuOpen=false; photosMoreOpen=false; photosSelectMode=false; photosSelected.clear(); renderPhotos(null,true); }
function openPhotosCollection(kind){
  openCollectionLibrary(kind==='all' ? null : kind);
}
function openPhotoDetail(id){ photosViewOverlay=true; photosInfoOpen=false; photosActionOpen=false; renderPhotos(id,true); }
function togglePhotoOverlay(e){
  if(e && e.target && e.target.closest('button,.photo-detail-menu,.photo-info-panel,.photo-strip')) return;
  photosViewOverlay=!photosViewOverlay; photosActionOpen=false; photosInfoOpen=false;
  const root=document.querySelector('.photos-view-screen');
  if(root) root.classList.toggle('overlay-hidden', !photosViewOverlay);
}
function togglePhotoFavorite(id){
  id=Number(id);
  if(photosFavorites.has(id)) photosFavorites.delete(id); else photosFavorites.add(id);
  photosViewOverlay=true;
  renderPhotos(id,true);
}
function deleteSinglePhoto(id){
  id=Number(id);
  deletePhotoIds([id]);
  photosViewOverlay=true; photosActionOpen=false; photosInfoOpen=false;
  renderPhotos(null,true);
}

function photoIcon(name, fallback){
  const src=`img/photo_icons/${name}.png`;
  return `<img class="photo-ui-icon" src="${src}" alt="" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<span class=&quot;photo-icon-fallback&quot;>${fallback}</span>')">`;
}

function photoActionMenu(id){
  const isHidden = activeCollection === 'hidden' || photosHidden.has(Number(id));
  const isDeleted = activeCollection === 'deleted';
  if(isDeleted){
    return `<div class="photo-detail-menu">
      <button onclick="restoreDeletedPhoto(${id})"><span>${photoIcon('restore','↩')}</span>Gendan</button>
    </div>`;
  }
  return `<div class="photo-detail-menu">
    <button onclick="showToast('Kopier kommer senere')"><span>${photoIcon('copy','▣')}</span>Kopier</button>
    <button onclick="showToast('Billedet er dubleret lokalt i næste version')"><span>${photoIcon('duplicate','▧')}</span>Dubler</button>
    <button onclick="${isHidden ? `unhidePhoto(${id})` : `photosHidden.add(Number(${id}));persistPhotoState();photosActionOpen=false;renderPhotos(null,true)`}"><span>${photoIcon('hide','◌')}</span>${isHidden?'Skjul ikke':'Skjul'}</button>
    <em></em>
    <button onclick="event.stopPropagation();addPhotoToAlbum(${id});photosActionOpen=false;renderPhotos(${id},true)"><span>${photoIcon('album','▤')}</span>Føj til album</button>
    <em></em>
    <button class="danger" onclick="deleteSinglePhoto(${id})"><span>${photoIcon('delete','♲')}</span>Slet</button>
  </div>`;
}
function renderPhotoDetail(selected, list){
  const id=Number(selected.id);
  const img=photoImg(selected);
  const photos=list && list.length ? list : currentPhotoListForViewer();
  const idx=Math.max(0,photos.findIndex(p=>Number(p.id)===id));
  const fav=photosFavorites.has(id) || selected.favorite===true || Number(selected.favorite)===1;
  const title=photoDetailDate(selected);
  const location=selected.location || selected.place || 'VIB Camera';
  const infoDate=title || 'Ukendt tidspunkt';
  appContent.innerHTML=`<div class="photos-view-screen ${photosViewOverlay?'':'overlay-hidden'}" onclick="togglePhotoOverlay(event)">
    <div class="photo-detail-top">
      <button class="photo-round-btn" onclick="event.stopPropagation();photosViewOverlay=true;photosInfoOpen=false;photosActionOpen=false;renderPhotos(null,true)">‹</button>
      <div class="photo-title-pill"><b>${esc(location)}</b><span>${esc(infoDate)}</span></div>
      <button class="photo-round-btn" onclick="event.stopPropagation();photosActionOpen=!photosActionOpen;photosInfoOpen=false;photosViewOverlay=true;renderPhotos(${id},true)">•••</button>
      ${photosActionOpen?photoActionMenu(id):''}
    </div>
    <div class="photo-fullstage"><img src="${esc(img)}" draggable="false"></div>
    ${photosInfoOpen?`<div class="photo-info-panel" onclick="event.stopPropagation()">
      <div class="photo-caption">Tilføj en billedtekst</div>
      <div class="photo-info-row"><b>${esc(infoDate)}</b><button onclick="showToast('Justering kommer senere')">Juster</button></div>
      <div class="photo-meta-card"><b>VIB Phone Camera</b><span>HEIF</span><p>Hovedkamera — 24 mm f/1,78</p><p>9:16 foto • ${esc(selected.id||'')}</p></div>
    </div>`:''}
    <div class="photo-strip">${photos.map((p,i)=>`<button class="${Number(p.id)===id?'active':''}" onclick="event.stopPropagation();photosViewOverlay=true;photosInfoOpen=false;photosActionOpen=false;renderPhotos(${Number(p.id)},true)"><img src="${esc(photoImg(p))}"></button>`).join('')}</div>
    <div class="photo-detail-bottom">
      <button onclick="event.stopPropagation();showToast('Deling kobles på Beskeder/Twitter senere')">${photoIcon('share','⇧')}</button>
      <div class="photo-bottom-pill compact">
        <button class="${fav?'liked':''}" onclick="event.stopPropagation();togglePhotoFavorite(${id})">♡</button>
        <button onclick="event.stopPropagation();photosInfoOpen=!photosInfoOpen;photosActionOpen=false;photosViewOverlay=true;renderPhotos(${id},true)">${photoIcon('info','ⓘ')}</button>
      </div>
      <button onclick="event.stopPropagation();deleteSinglePhoto(${id})">${photoIcon('trash','🗑')}</button>
    </div>
    ${photoAlbumModalHtml()}
  </div>`;
  setTimeout(()=>{
    const strip=document.querySelector('.photo-strip');
    const active=document.querySelector('.photo-strip button.active');
    if(strip && active) strip.scrollLeft = Math.max(0, active.offsetLeft - strip.clientWidth/2 + active.clientWidth/2);
  },30);
}


function renderPhotoCollections(){
  normalizePhotoAlbums();
  const all=(DATA.photos||[]);
  const visible=collectionPhotos(null);
  const fav=collectionPhotos('favorites');
  const shared=collectionPhotos('twitter');
  const hidden=collectionPhotos('hidden');
  const selfies=collectionPhotos('selfies');
  const deleted=photosRecentlyDeleted||[];
  function sample(list){
    const arr=(list&&list.length?list:[]).slice(0,4);
    return `<div class="collection-mosaic">${arr.slice(0,4).map(p=>`<img src="${esc(photoImg(p))}">`).join('') || '<span></span>'}</div>`;
  }
  function card(title,count,kind,list,sub){
    return `<button class="collection-card" onclick="openPhotosCollection('${kind}')">${sample(list)}<div><b>${esc(title)}</b><small>${esc(sub||count+' emner')}</small></div></button>`;
  }
  const albumCards = normalizePhotoAlbums().map(a=>card(a.title, (a.ids||[]).length, 'album:'+a.id, collectionPhotos('album:'+a.id))).join('');
  appContent.innerHTML=`<div class="photos-screen collections-screen">
    <div class="photos-top-fade"></div>
    <div class="photos-header collections-header">
      <div class="photos-title-row"><div><h1>Samlinger</h1><p><span class="photos-cloud">☁</span> ${visible.length} emner</p></div><div class="photos-actions"><button class="photos-menu-btn" onclick="showToast('Tilpas samlinger kommer senere')">☰</button></div></div>
    </div>
    <div class="collections-content">
      <section><div class="collection-section-title"><b>Fastgjort</b><button onclick="showToast('Rediger fastgjorte samlinger kommer senere')">Rediger</button></div><div class="collection-row">
        ${card('Seneste',visible.length,'all',visible,'Alle billeder')}
        ${card('Favoritter',fav.length,'favorites',fav,'Likede billeder')}
        ${card('Skjult',hidden.length,'hidden',hidden,'Skjulte elementer')}
      </div></section>
      <section><div class="collection-section-title"><b>Albummer</b><button onclick="addPhotoAlbum()">+</button></div><div class="collection-row albums-row">
        ${card('Kamerarulle',visible.length,'all',visible)}
        ${card('Twitter',shared.length,'twitter',shared,'Delt og gemt')}
        ${albumCards}
      </div></section>
      <section><div class="collection-section-title"><b>Medietyper</b></div><div class="collection-list">
        <button onclick="openPhotosCollection('all')"><span>📷</span><b>Fotos</b><small>${visible.length}</small></button>
        <button onclick="openPhotosCollection('selfies')"><span>🤳</span><b>Selfies</b><small>${selfies.length}</small></button>
        <button onclick="openPhotosCollection('favorites')"><span>♡</span><b>Favoritter</b><small>${fav.length}</small></button>
      </div></section>
      <section><div class="collection-section-title"><b>Værktøjer</b></div><div class="collection-list">
        <button onclick="openPhotosCollection('hidden')"><span>◌</span><b>Skjult</b><small>${hidden.length}</small></button>
        <button onclick="openPhotosCollection('deleted')"><span>🗑</span><b>Slettet for nylig</b><small>${deleted.length}</small></button>
      </div></section>
    </div>
    ${photoAlbumModalHtml()}
    <div id="photosTabbar" class="photos-bottom-bar"><div class="photos-pill-tabs"><button onclick="setPhotosTab('library')"><span>▧</span>Bibliotek</button><button class="active" onclick="setPhotosTab('collections')"><span>▤</span>Samlinger</button></div><button class="photos-search-btn" onclick="photosTab='library';photosSearchOpen=true;renderPhotos(null,true)">⌕</button></div>
  </div>`;
  setTimeout(()=>{ const i=document.getElementById('newAlbumName'); if(i) i.focus(); document.querySelectorAll('.collection-row,.albums-row').forEach(row=>row.addEventListener('wheel',ev=>{ if(Math.abs(ev.deltaY)>Math.abs(ev.deltaX)){ row.scrollLeft += ev.deltaY; ev.preventDefault(); } },{passive:false})); },50);
}

function renderPhotos(openId, keepScroll){
  cameraNativeExit();
  phone.classList.remove('camera-active');
  phone.classList.add('ios-light-app','photos-app-mode');
  const allPhotos=DATA.photos||[];
  const photos=filteredPhotos();
  if(!openId && photosTab==='collections') return renderPhotoCollections();
  const currentGrid=document.getElementById('photosGrid');
  const wantedScroll = keepScroll && currentGrid ? currentGrid.scrollTop : photosScrollPos;
  const selected = openId ? (allPhotos.find(x=>Number(x.id)===Number(openId)) || (photosRecentlyDeleted||[]).find(x=>Number(x.id)===Number(openId))) : null;
  if(selected){
    renderPhotoDetail(selected, photos);
    return;
  }
  const selectedCount=photosSelected.size;
  const viewTitle = collectionTitle(activeCollection);
  const syncText = photosSelectMode ? `Synkroniserer ${selectedCount || photos.length} emner...` : `${photos.length} emner`;
  appContent.innerHTML=`<div class="photos-screen">
    <div class="photos-top-fade"></div>
    <div class="photos-header">
      <div class="photos-title-row">
        <div><h1>${esc(viewTitle)}</h1><p><span class="photos-cloud">☁</span> ${syncText}</p></div>
        <div class="photos-actions">${photosSelectMode?`<button class="photos-menu-btn" onclick="photosMenuOpen=!photosMenuOpen;photosMoreOpen=false;renderPhotos()">☰</button><button class="photos-more ${selectedCount>0?'enabled':''}" onclick="if(photosSelected.size){photosMoreOpen=!photosMoreOpen;photosMenuOpen=false;renderPhotos()}">•••</button><button class="photos-select-close" onclick="photosSelectMode=false;photosSelected.clear();photosMoreOpen=false;photosMenuOpen=false;renderPhotos()">×</button>`:`<button class="photos-menu-btn" onclick="photosMenuOpen=!photosMenuOpen;photosMenuPanel='main';renderPhotos()">☰</button><button class="photos-select-btn" onclick="photosSelectMode=true;photosMenuOpen=false;photosMenuPanel='main';renderPhotos()">Vælg</button>`}</div>
      </div>
      ${photosMenuOpen?photosMenuHtml():''}${photosMoreOpen?photosSelectionMenuHtml():''}
      ${photosSearchOpen?`<div class="photos-search-panel"><input id="photosSearchInput" placeholder="Søg efter dato eller id" value="${esc(photosSearchQuery)}"><button onclick="photosSearchQuery='';photosSearchOpen=false;renderPhotos(null,true)">×</button></div>`:''}
    </div>
    <div id="photosGrid" class="photos-library-grid cols-${photosGridCols}">${photos.map(p=>photoTileHtml(p)).join('') || '<div class="ios-empty photos-empty">Ingen billeder endnu.</div>'}</div>
    ${photosSelectMode?`<div class="photos-select-bar"><button onclick="showToast('Del kommer i næste billeddelings-version')">⇧</button><span>${selectedCount>0?selectedCount+' foto valgt':'Vælg emner'}</span><button onclick="deleteSelectedPhotos()">🗑</button></div>`:`<div id="photosTabbar" class="photos-bottom-bar"><div class="photos-pill-tabs"><button class="active" onclick="setPhotosTab('library')"><span>▧</span>Bibliotek</button><button onclick="setPhotosTab('collections')"><span>▤</span>Samlinger</button></div><button class="photos-search-btn" onclick="photosSearchOpen=!photosSearchOpen;renderPhotos(null,true)">⌕</button></div>`}
  </div>`;
  const grid=document.getElementById('photosGrid'); const bar=document.getElementById('photosTabbar');
  const searchInput=document.getElementById('photosSearchInput');
  if(searchInput){
    searchInput.focus();
    searchInput.addEventListener('input', function(){ photosSearchQuery=this.value; renderPhotos(null,true); });
  }
  if(grid){
    grid.style.overscrollBehavior='contain';
    setTimeout(()=>{
      if(typeof wantedScroll === 'number') grid.scrollTop = wantedScroll;
      else if(!photosDidInitialScroll){ grid.scrollTop = grid.scrollHeight; photosDidInitialScroll = true; }
      photosScrollPos = grid.scrollTop;
    }, 30);
    let last=grid.scrollTop;
    grid.addEventListener('scroll',()=>{
      const now=grid.scrollTop;
      photosScrollPos = now;
      if(bar) bar.classList.toggle('hide', now < last && now > 30);
      last=now;
    });
  }
}
function photoTileHtml(p){
  const id=Number(p.id); const selected=photosSelected.has(id);
  return `<button class="photo-tile ${selected?'selected':''}" onclick="photoTileClick(${id})"><img src="${esc(photoImg(p))}" loading="lazy"><span class="photo-check">✓</span></button>`;
}
function photoTileClick(id){
  if(photosSelectMode){
    const grid=document.getElementById('photosGrid');
    if(grid) photosScrollPos = grid.scrollTop;
    if(photosSelected.has(id)) photosSelected.delete(id); else photosSelected.add(id);
    renderPhotos(null,true);
  } else openPhotoDetail(id);
}
function deleteSelectedPhotos(){
  const ids=[...photosSelected];
  if(!ids.length){ showToast('Vælg først et billede.'); return; }
  deletePhotoIds(ids);
  photosSelected.clear(); photosMoreOpen=false; photosSelectMode=false;
  renderPhotos(null,true);
}
function hideSelectedPhotos(){
  if(!photosSelected.size){ showToast('Vælg først et billede.'); return; }
  [...photosSelected].forEach(id=>photosHidden.add(Number(id)));
  persistPhotoState();
  photosSelected.clear(); photosMoreOpen=false; photosSelectMode=false;
  renderPhotos(null,true);
}


function showCall(data, status, incoming=false){ currentCall=data.callId; currentCallName=data.name||'Ukendt'; callIsActive=status==='I opkald'; setMiniCall(false); phone.classList.remove('mini','ios-light-app'); setPage(callView); document.getElementById('callName').textContent=data.name||'Ukendt'; document.getElementById('callNumber').textContent=data.number||''; document.getElementById('callStatus').textContent=status; document.getElementById('answerBtn').classList.toggle('hidden',!incoming); }
function endCall(){ nui('endCall',{callId:currentCall}); }

document.querySelectorAll('[data-app]').forEach(b=>b.addEventListener('click',()=>openApp(b.dataset.app)));
document.getElementById('homeBar').onclick=()=>{ if(callView.classList.contains('active') && currentCall && callIsActive){ nui('close'); return; } if(activeApp !== 'home'){ backHome(); return; } nui('close'); };
window.addEventListener('keydown', e=>{ if(e.key==='Escape') nui('close'); });
window.addEventListener('focusin', e=>{ if(e.target && (e.target.matches('input, textarea') || e.target.isContentEditable)) nui('inputFocus',{focused:true}); });
window.addEventListener('focusout', e=>{ if(e.target && (e.target.matches('input, textarea') || e.target.isContentEditable)) nui('inputFocus',{focused:false}); });
document.getElementById('hangupBtn').onclick=endCall; document.getElementById('answerBtn').onclick=()=>nui('answerCall',{callId:currentCall});
document.getElementById('muteBtn').onclick=()=>{muted=!muted; document.getElementById('muteBtn').style.background=muted?'rgba(255,255,255,.35)':'rgba(255,255,255,.16)'; nui('mute',{enabled:muted,callId:currentCall});};
document.getElementById('speakerBtn').onclick=()=>{speaker=!speaker; document.getElementById('speakerBtn').style.background=speaker?'rgba(255,255,255,.35)':'rgba(255,255,255,.16)'; nui('speaker',{enabled:speaker,callId:currentCall});};


function getScrollSnapshot(){
  const el = document.querySelector('.call-contact-card-scroll,.call-contact-list,.call-list,.ios-chat-list,.call-info-scroll,.app-content');
  return el ? { selector: el.className.split(' ').map(c=>'.'+c).join(''), top: el.scrollTop } : null;
}
function restoreScrollSnapshot(snap){
  if(!snap) return;
  setTimeout(()=>{
    const candidates = document.querySelectorAll('.call-contact-card-scroll,.call-contact-list,.call-list,.ios-chat-list,.call-info-scroll,.app-content');
    const el = candidates[0];
    if(el) el.scrollTop = snap.top;
  },0);
}
function softRefreshActiveApp(){
  // V27: Data opdateres i baggrunden uden at genbygge den åbne app.
  // Det stopper hop til toppen og inputfelter der mister fokus.
  if(activeApp==='home') return;
}


function cropImageToPortrait(dataUrl, cb){
  const img = new Image();
  img.onload = function(){
    try{
      const targetRatio = 9/16;
      let sx = 0, sy = 0, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
      const currentRatio = sw / sh;
      if(currentRatio > targetRatio){
        const newW = Math.floor(sh * targetRatio);
        sx = Math.floor((sw - newW) / 2);
        sw = newW;
      } else if(currentRatio < targetRatio){
        const newH = Math.floor(sw / targetRatio);
        sy = Math.floor((sh - newH) / 2);
        sh = newH;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/jpeg', 0.92));
    }catch(err){
      console.error('VIB Phone portrait crop failed', err);
      cb(dataUrl);
    }
  };
  img.onerror = function(){ cb(dataUrl); };
  img.src = dataUrl;
}
function saveCameraPhotoToUiAndServer(image, createdAt){
  const ph={ id: Date.now(), image:image, image_data:image, created_at:createdAt||Math.floor(Date.now()/1000), date:formatChatTime(createdAt||Math.floor(Date.now()/1000)), facing:cameraFacing };
  if(cameraFacing==='front'){ photosSelfies.add(Number(ph.id)); persistPhotoState(); }
  DATA.photos = DATA.photos || [];
  DATA.photos.unshift(ph);
  if(activeApp==='camera'){
    const thumb=document.querySelector('.camera-thumb');
    if(thumb){ thumb.classList.add('has-photo'); thumb.innerHTML=`<img src="${esc(ph.image)}" onerror="this.parentElement.classList.remove('has-photo');this.remove()">`; }
  }
  nui('cameraSaveCroppedPhoto',{image});
  setTimeout(()=>nui('requestData'),650);
}

window.addEventListener('message', e=>{
  const m=e.data||{};
  if(m.action==='open'){ phone.classList.add('open'); phone.classList.remove('mini'); updatePhoneAppClass(activeApp||'home'); applyPhoneAppearance(); }
  if(m.action==='close'){ if(currentCall && callIsActive){ phone.classList.add('mini'); setMiniCall(true); } else phone.classList.remove('open','mini'); }
  if(m.action==='data'){
    DATA=normalizeData(m.data||DATA);
    setWallpaper(DATA.settings?.wallpaper||1);
    applyPhoneAppearance();
    updateBadges();
    // Ingen synlig re-render her. UI'et bliver stående præcis hvor spilleren er.
    softRefreshActiveApp();
  }
  if(m.action==='cameraRawCaptured'){
    const createdAt=m.created_at||Math.floor(Date.now()/1000);
    cropImageToPortrait(m.image, function(cropped){
      saveCameraPhotoToUiAndServer(cropped, createdAt);
    });
  }
  if(m.action==='cameraPhotoSaved'){
    saveCameraPhotoToUiAndServer(m.image, m.created_at||Math.floor(Date.now()/1000));
  }
  if(m.action==='tweets'){ DATA.tweets=m.tweets||[]; if(activeApp==='twitter') renderTwitter(); }
  if(m.action==='notification') showNotification(m.payload||{});
  if(m.action==='cameraCaptureHide') phone.classList.toggle('capture-hidden', m.hidden===true);
  if(m.action==='vehicleStatus'){ DATA.inVehicle = m.inVehicle === true; if(activeApp==='settings' && settingsPage==='bluetooth') renderSettings('bluetooth'); }
  if(m.action==='toast') showToast(m.text||'');
  if(m.action==='incomingCall') showCall(m.data,'Ringer...',true);
  if(m.action==='outgoingCall') showCall(m.data,'Ringer...',false);
  if(m.action==='callActive'){ currentCall=m.data.callId; callIsActive=true; document.getElementById('callStatus').textContent='I opkald'; setMiniCall(false); }
  if(m.action==='callEnded'){ currentCall=null; callIsActive=false; setMiniCall(false); backHome(); }
});
function showNotification(p){ notification.querySelector('.n-app').textContent=p.app||'Telefon'; notification.querySelector('.n-title').textContent=p.title||''; notification.querySelector('.n-text').textContent=p.text||''; notification.classList.remove('hidden'); setTimeout(()=>notification.classList.add('hidden'),4600); }
function updateClock(){ const d=new Date(); document.getElementById('clock').textContent=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
updateClock(); setInterval(updateClock,10000);
// V27: ingen synlig auto-refresh mens spilleren er inde i en app.
// Data hentes ved åbning og efter handlinger, så siden ikke hopper tilbage til toppen.
// setInterval(()=>{ if(activeApp==='calls') nui('requestData'); }, 7000);
applyPhoneAppearance();
initIconFallbacks();
nui('requestData');

// V65: sikre at range-sliders altid får korrekt iOS fill efter alle settings renders.
(function(){ const _oldRenderSettings = renderSettings; renderSettings = function(page){ const r=_oldRenderSettings(page); setTimeout(hydrateRanges,0); return r; }; })();


/* V71 — iOS 18 Control Center rebuilt
   Drag ned fra højre side af Dynamic Island.  Long-press/hold på større fliser åbner deres detaljer. */
(function(){
  if(typeof phone === 'undefined') return;
  vibSettings.airplane = typeof vibSettings.airplane === 'undefined' ? false : vibSettings.airplane;
  vibSettings.wifi = typeof vibSettings.wifi === 'undefined' ? true : vibSettings.wifi;
  vibSettings.bluetooth = typeof vibSettings.bluetooth === 'undefined' ? true : vibSettings.bluetooth;
  vibSettings.cellular = typeof vibSettings.cellular === 'undefined' ? true : vibSettings.cellular;
  vibSettings.focus = typeof vibSettings.focus === 'undefined' ? false : vibSettings.focus;
  vibSettings.flashlight = typeof vibSettings.flashlight === 'undefined' ? false : vibSettings.flashlight;
  vibSettings.rotationLock = typeof vibSettings.rotationLock === 'undefined' ? false : vibSettings.rotationLock;
  vibSettings.lowPower = typeof vibSettings.lowPower === 'undefined' ? false : vibSettings.lowPower;
  vibSettings.volume = typeof vibSettings.volume === 'undefined' ? 62 : vibSettings.volume;
  vibSettings.brightness = typeof vibSettings.brightness === 'undefined' ? 86 : vibSettings.brightness;
  persistVibSettings();

  let ccOpen = false;
  let ccStart = null;
  let ccDragging = false;
  let ccExpanded = 'main';
  let pressTimer = null;

  function vBool(key){ return vibSettings[key] === true; }
  function ensureCC(){
    if(document.getElementById('controlCenter')) return;
    const screen = phone.querySelector('.screen');
    if(!screen) return;
    const el = document.createElement('div');
    el.id = 'controlCenter';
    el.className = 'cc-overlay cc-hidden';
    el.innerHTML = '<div class="cc-frost"></div><div class="cc-sheet" id="ccSheet"></div>';
    screen.appendChild(el);
    el.addEventListener('click', function(e){ if(e.target.classList.contains('cc-overlay') || e.target.classList.contains('cc-frost')) closeCC(); });
  }

  function netSub(){
    if(!vibSettings.cellular) return 'Ingen forbindelse';
    return 'Call me 5G';
  }
  function batteryText(){ return '77%'; }
  function activeClass(key){ return vBool(key) ? 'active' : ''; }
  function ccGlyph(key){
    return ({airplane:'✈',wifi:'◠',bluetooth:'ᛒ',cellular:'▮',airdrop:'◎',hotspot:'⊘',focus:'☾',flashlight:'⚡',camera:'◎',rotation:'↻',calc:'＋',record:'●',alarm:'⌚',wallet:'▭',translate:'文',dark:'◐',power:'⏻',plus:'＋',screen:'▣',heart:'♥',music:'♪',remote:'⌁'})[key] || '•';
  }
  function toggleBtn(key,label,sub,opts={}){
    const active = key==='dark' ? (vibSettings.appearance==='dark') : vBool(key);
    const on = opts.on || `ccToggle('${key}')`;
    const hold = opts.hold || '';
    const disabled = opts.disabled ? 'disabled' : '';
    return `<button class="cc-toggle ${active?'active':''} ${disabled}" onclick="${on}" ${hold?`onpointerdown="ccPressStart('${hold}')" onpointerup="ccPressEnd()" onpointerleave="ccPressEnd()"`:''}><b>${ccGlyph(key)}</b><span>${esc(label)}</span>${sub?`<small>${esc(sub)}</small>`:''}</button>`;
  }
  function circleBtn(key,label,on,active){
    return `<button class="cc-circle ${active?'active':''}" onclick="${on||''}"><b>${ccGlyph(key)}</b><span>${esc(label)}</span></button>`;
  }
  function renderMain(){
    const wifi = vibSettings.wifi ? 'VIB Network' : 'Fra';
    const bt = DATA.inVehicle ? 'Apple CarPlay' : (vibSettings.bluetooth ? 'Til' : 'Fra');
    return `
      <div class="cc-status cc-ios-status">
        <button class="cc-small-text cc-plus" onclick="showToast('Tilpasning kommer senere')">＋</button>
        <div class="cc-carrier"><span class="cc-bars">▂▃▅▆</span><b>Call me</b></div>
        <div class="cc-batt-wrap"><b>${batteryText()}</b><span class="cc-battery"><i></i></span></div>
        <button class="cc-small-text cc-power" onclick="showToast('Telefonen kan ikke slukkes endnu')">⏻</button>
      </div>
      <div class="cc-main-grid cc-ios-main">
        <section class="cc-glass cc-network cc-network-ios" onpointerdown="ccPressStart('network')" onpointerup="ccPressEnd()" onpointerleave="ccPressEnd()">
          ${toggleBtn('airplane','Flyfunktion',vibSettings.airplane?'Til':'Fra')}
          ${toggleBtn('airdrop','AirDrop','Kun kontakter',{on:"showToast('AirDrop kommer senere')"})}
          ${toggleBtn('wifi','Wi‑Fi',wifi,{hold:'network'})}
          ${toggleBtn('bluetooth','Bluetooth',bt,{hold:'network'})}
        </section>
        <section class="cc-glass cc-music cc-music-ios" onclick="ccExpand('music')" onpointerdown="ccPressStart('music')" onpointerup="ccPressEnd()" onpointerleave="ccPressEnd()">
          <div class="cc-art"></div><button class="cc-airplay">◎</button><h3>Afspiller ikke</h3><div class="cc-player-row"><span>◀</span><b>▶</b><span>▶</span></div>
        </section>
        <button class="cc-roundalone ${vBool('focus')?'active':''}" onclick="ccToggle('focus')"><b>☾</b><span>Fokus</span></button>
        <button class="cc-roundalone ${vBool('flashlight')?'active':''}" onclick="ccToggleFlashlight()"><b>⚡</b><span>Lommelygte</span></button>
        <button class="cc-roundalone ${vBool('rotationLock')?'active':''}" onclick="ccToggle('rotationLock')"><b>↻</b><span>Låst rotation</span></button>
        <button class="cc-roundalone" onclick="closeCC();openApp('camera')"><b>◎</b><span>Kamera</span></button>
        <section class="cc-glass cc-pillwide ${vibSettings.appearance==='dark'?'active':''}" onclick="ccToggleAppearance()"><b>◐</b><span>${vibSettings.appearance==='dark'?'Mørk':'Lys'}</span></section>
        <section class="cc-glass cc-vertical brightness" onpointerdown="ccPressStart('brightness')" onpointerup="ccPressEnd()" onpointerleave="ccPressEnd()"><input class="cc-vslider" type="range" min="10" max="100" value="${Number(vibSettings.brightness||86)}" oninput="ccRange('brightness',this.value)"><span>☀</span></section>
        <section class="cc-glass cc-vertical volume" onpointerdown="ccPressStart('volume')" onpointerup="ccPressEnd()" onpointerleave="ccPressEnd()"><input class="cc-vslider" type="range" min="0" max="100" value="${Number(vibSettings.volume||62)}" oninput="ccRange('volume',this.value)"><span>🔊</span></section>
        <button class="cc-roundalone" onclick="showToast('Lommeregner kommer senere')"><b>＋</b><span>Lommeregner</span></button>
        <button class="cc-roundalone" onclick="showToast('Optagelse kommer senere')"><b>●</b><span>Optag</span></button>
      </div>`;
  }
  function renderNetwork(){
    const bt = DATA.inVehicle ? 'Apple CarPlay' : (vibSettings.bluetooth ? 'Til' : 'Fra');
    return `
      <div class="cc-status"><button class="cc-small-text" onclick="ccExpand('main')">‹</button><div><b>${netSub()}</b></div><div><b>${batteryText()}</b><span class="cc-battery"><i></i></span></div><button class="cc-small-text" onclick="closeCC()">×</button></div>
      <div class="cc-expanded-stack">
        <button class="cc-glass cc-wide-network ${vBool('airplane')?'active':''}" onclick="ccToggle('airplane')"><b>✈</b><span>Flyfunktion</span><small>${vibSettings.airplane?'Til':'Fra'}</small></button>
        <div class="cc-net-grid">
          <button class="cc-glass cc-big-square ${vBool('wifi')?'active':''}" onclick="ccToggle('wifi')"><b>◠</b><span>Wi‑Fi</span><small>${vibSettings.wifi?'VIB Network':'Ikke tilsluttet'}</small></button>
          <button class="cc-glass cc-big-square active" onclick="showToast('AirDrop kommer senere')"><b>◎</b><span>AirDrop</span><small>Kun kontakter</small></button>
          <button class="cc-glass cc-big-square ${vBool('cellular')?'active':''}" onclick="ccToggle('cellular')"><b>▮</b><span>Mobildata</span><small>${vibSettings.cellular?'Callme':'Fra'}</small></button>
          <button class="cc-glass cc-big-square ${vBool('bluetooth')?'active':''}" onclick="ccToggle('bluetooth')"><b>ᛒ</b><span>Bluetooth</span><small>${esc(bt)}</small></button>
        </div>
        <button class="cc-glass cc-wide-network" onclick="showToast('Internetdeling kommer senere')"><b>⊘</b><span>Internetdeling</span><small>Fra</small></button>
        <button class="cc-glass cc-wide-network disabled"><b>🌐</b><span>VPN</span><small>Fra</small></button>
      </div>`;
  }
  function renderMusic(){
    return `
      <div class="cc-status"><button class="cc-small-text" onclick="ccExpand('main')">‹</button><div><b>${netSub()}</b></div><div><b>${batteryText()}</b><span class="cc-battery"><i></i></span></div><button class="cc-small-text" onclick="closeCC()">×</button></div>
      <section class="cc-glass cc-music-large">
        <div class="cc-large-art"></div><h2>Afspiller ikke</h2><div class="cc-progress"></div><div class="cc-time-row"><span>--:--</span><span>--:--</span></div><div class="cc-large-controls"><span>◀</span><b>▶</b><span>▶</span></div><input class="cc-hslider" type="range" min="0" max="100" value="${Number(vibSettings.volume||62)}" oninput="ccRange('volume',this.value)"><button class="cc-airplay-pill">◎ AirPlay</button>
      </section>`;
  }
  function renderSlider(type){
    const isB = type==='brightness';
    return `
      <div class="cc-status"><button class="cc-small-text" onclick="ccExpand('main')">‹</button><div><b>${isB?'Lysstyrke':'Lydstyrke'}</b></div><div><b>${batteryText()}</b><span class="cc-battery"><i></i></span></div><button class="cc-small-text" onclick="closeCC()">×</button></div>
      <section class="cc-slider-full"><div class="cc-glass cc-vertical cc-vertical-large"><input class="cc-vslider" type="range" min="${isB?10:0}" max="100" value="${Number(vibSettings[type]||0)}" oninput="ccRange('${type}',this.value)"><span>${isB?'☀':'🔊'}</span></div><h2>${isB?'Lysstyrke':'Lydstyrke'}</h2><p>Træk for at justere.</p></section>`;
  }
  function renderCC(){
    ensureCC();
    const sheet=document.getElementById('ccSheet'); if(!sheet) return;
    sheet.className = 'cc-sheet cc-mode-'+ccExpanded;
    sheet.innerHTML = ccExpanded==='network' ? renderNetwork() : ccExpanded==='music' ? renderMusic() : ccExpanded==='brightness' ? renderSlider('brightness') : ccExpanded==='volume' ? renderSlider('volume') : renderMain();
    hydrateCCSliders();
  }
  function hydrateCCSliders(){
    document.querySelectorAll('#controlCenter input[type="range"]').forEach(el=>{
      const min=Number(el.min||0), max=Number(el.max||100), val=Number(el.value||0);
      el.style.setProperty('--range-fill', ((val-min)/(max-min)*100)+'%');
    });
  }
  window.ccExpand = function(mode){ ccExpanded=mode||'main'; renderCC(); };
  window.openControlCenter = function(){ ensureCC(); ccExpanded='main'; renderCC(); const el=document.getElementById('controlCenter'); if(!el) return; ccOpen=true; phone.classList.add('cc-open'); el.classList.remove('cc-hidden'); requestAnimationFrame(()=>el.classList.add('open')); };
  window.closeCC = function(){ const el=document.getElementById('controlCenter'); if(!el) return; ccOpen=false; phone.classList.remove('cc-open'); el.classList.remove('open'); setTimeout(()=>{ if(!ccOpen) el.classList.add('cc-hidden'); },320); };
  window.ccToggle = function(key){ vibSettings[key] = !vibSettings[key]; persistVibSettings(); applyPhoneAppearance(); renderCC(); if(activeApp==='settings') renderSettings(settingsPage); };
  window.ccToggleAppearance = function(){ vibSettings.appearance = vibSettings.appearance==='dark'?'light':'dark'; persistVibSettings(); applyPhoneAppearance(); renderCC(); if(activeApp==='settings') renderSettings(settingsPage); };
  window.ccRange = function(key,value){ vibSettings[key] = Number(value); persistVibSettings(); applyPhoneAppearance(); const el=event&&event.target?event.target:null; if(el){ const min=Number(el.min||0), max=Number(el.max||100), val=Number(value); el.style.setProperty('--range-fill', ((val-min)/(max-min)*100)+'%'); } };
  window.ccToggleFlashlight = function(){ vibSettings.flashlight=!vibSettings.flashlight; persistVibSettings(); showToast(vibSettings.flashlight?'Lommelygte tændt':'Lommelygte slukket'); renderCC(); };
  window.ccPressStart = function(mode){ ccPressEnd(); pressTimer=setTimeout(()=>{ pressTimer=null; ccExpand(mode); },430); };
  window.ccPressEnd = function(){ if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };

  function isTopRightStart(ev){
    const screen = phone.querySelector('.screen'); if(!screen) return false;
    const rect = screen.getBoundingClientRect();
    const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - rect.top;
    return y >= 0 && y < 118 && x > rect.width * .55;
  }
  function getPoint(ev){ const p=ev.touches?ev.touches[0]:ev; return {x:p.clientX,y:p.clientY}; }
  function start(ev){ if(!phone.classList.contains('open')) return; if(isTopRightStart(ev)){ ccStart=getPoint(ev); ccDragging=true; } }
  function move(ev){ if(!ccDragging || !ccStart) return; const p=getPoint(ev); const dy=p.y-ccStart.y; if(dy>34){ ev.preventDefault(); ccDragging=false; openControlCenter(); } }
  function end(ev){ if(ccOpen && ccStart){ const p=getPoint(ev.changedTouches?{touches:ev.changedTouches}:ev); if(ccStart.y-p.y>55) closeCC(); } ccDragging=false; ccStart=null; }
  const screen = phone.querySelector('.screen');
  if(screen){
    screen.addEventListener('mousedown',start,{passive:true});
    screen.addEventListener('mousemove',move,{passive:false});
    window.addEventListener('mouseup',end,{passive:true});
    screen.addEventListener('touchstart',start,{passive:true});
    screen.addEventListener('touchmove',move,{passive:false});
    screen.addEventListener('touchend',end,{passive:true});
  }
  document.addEventListener('keydown',function(e){ if(e.key==='Escape' && ccOpen){ closeCC(); } });
})();

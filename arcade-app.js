import {ACHIEVEMENTS} from '/shared/arcade-rules.mjs';
/* The 420 Lobby arcade shell. Identity and scores always come from the API. */
const byId = id => document.getElementById(id);
const games = { 'sesh-signal': 'Sesh Signal', 'green-room-match': 'Green Room Match', 'bong-blitz': 'Bong Blitz' };
let session = {user:null,csrfToken:null,configured:false};
let sessionAvailable = false;
let cleanupGame = null;
let gameOpening = 0;
let boardRequest = 0;
let period = 'week';
for (const achievement of ACHIEVEMENTS) {
  const node=el('div',undefined,'achievement locked');node.dataset.achievement=achievement.id;
  const icon=el('span',achievement.icon);icon.setAttribute('aria-hidden','true');
  node.append(icon,el('b',achievement.title),el('small',achievement.description));
  byId('achievement-grid').append(node);
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, {credentials:'same-origin', cache:'no-store', ...options, signal:controller.signal});
    let data;
    try { data = await response.json(); } catch { throw new Error('The arcade service is unavailable. Please try again later.'); }
    if (!response.ok) throw new Error(data.error?.message || 'The request could not be completed. Please try again.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The arcade service took too long to respond. Please try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function avatar(url, className) {
  const image = el('img', undefined, className);
  image.alt = '';
  image.width = 32; image.height = 32;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' && ['cdn.discordapp.com','media.discordapp.net'].includes(parsed.hostname)) image.src = parsed.href;
  } catch { /* No untrusted or malformed avatar URLs. */ }
  image.addEventListener('error', () => { image.hidden = true; }, {once:true});
  return image;
}
function showDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}
function signInMessage() {
  return !sessionAvailable ? 'Discord sign-in is temporarily unavailable. Please try again later.' : !session.configured ? 'Discord sign-in is awaiting server configuration. Games will unlock when sign-in is available.' : '';
}
function login() {
  byId('login-status').textContent = signInMessage();
  showDialog(byId('login-dialog'));
}
function updateIdentity() {
  const loggedIn = Boolean(session.user);
  byId('header-login').hidden = loggedIn;
  byId('account-chip').hidden = !loggedIn;
  byId('signin-banner').hidden = loggedIn;
  byId('auth-status').textContent = loggedIn ? '' : signInMessage() || 'Ready when you are. Connect Discord to start playing.';
  byId('login-status').textContent = signInMessage();
  if (loggedIn) {
    byId('account-name').textContent = session.user.username;
    const image = avatar(session.user.avatarUrl);
    image.id = 'account-avatar'; image.width = 30; image.height = 30;
    byId('account-avatar').replaceWith(image);
  }
  document.querySelectorAll('.discord-login').forEach(link => {
    if (!sessionAvailable || !session.configured) link.setAttribute('aria-disabled','true');
    else link.removeAttribute('aria-disabled');
  });
}
async function loadSession() {
  try {
    const data = await api('/api/session');
    if (!data || !Object.hasOwn(data,'user')) throw new Error('Invalid session response.');
    session = data; sessionAvailable = true;
  } catch { session = {user:null,csrfToken:null,configured:false}; sessionAvailable = false; }
  updateIdentity();
  return session;
}
async function loadBoard() {
  const request = ++boardRequest;
  const game = byId('board-game').value;
  byId('board-status').textContent = 'Loading verified scores…';
  byId('refresh-board').disabled = true;
  try {
    const data = await api('/api/leaderboards?game=' + encodeURIComponent(game) + '&period=' + period);
    if (request !== boardRequest) return;
    const rows = byId('leaderboard-rows'); rows.replaceChildren();
    if (!data.entries?.length) {
      const row = el('tr'); const cell = el('td','The board is wide open. Play a round and set the pace.','table-empty');
      cell.colSpan = 3; row.append(cell); rows.append(row);
    } else {
      data.entries.forEach(entry => {
        const row = el('tr');
        const rank = el('td', String(entry.rank).padStart(2,'0'));
        const playerCell = el('td'); const player = el('div',undefined,'board-player');
        player.append(avatar(entry.user.avatarUrl),el('span',entry.user.username)); playerCell.append(player);
        row.append(rank,playerCell,el('td',Number(entry.score).toLocaleString())); rows.append(row);
      });
    }
    byId('board-status').textContent = period === 'week' ? 'Best score per player from the last 7 days.' : 'Best verified score per player, all time.';
  } catch (error) {
    if (request !== boardRequest) return;
    const row = el('tr'); const cell = el('td','The leaderboard is unavailable. Check back soon.','table-empty');
    cell.colSpan = 3; row.append(cell); byId('leaderboard-rows').replaceChildren(row);
    byId('board-status').textContent = error.message;
  } finally { if (request === boardRequest) byId('refresh-board').disabled = false; }
}
function renderAchievements(achievements = []) {
  const unlocked = new Set(achievements.map(a => typeof a === 'string' ? a : a.id));
  let count = 0;
  document.querySelectorAll('[data-achievement]').forEach(node => {
    const earned = unlocked.has(node.dataset.achievement);
    node.classList.toggle('locked',!earned);
    node.setAttribute('aria-label',node.querySelector('b').textContent + (earned ? ', unlocked' : ', locked'));
    if (earned) count++;
  });
  byId('achievement-count').textContent = count + ' / ' + ACHIEVEMENTS.length;
}
async function loadProfile() {
  if (!session.user) return;
  const box = byId('profile-content');
  try {
    const data = await api('/api/profile');
    const identity = el('div',undefined,'profile-identity');
    const copy = el('div'); copy.append(el('h3',data.user.username),el('p','CONNECTED WITH DISCORD'));
    identity.append(avatar(data.user.avatarUrl),copy);
    const stats = el('div',undefined,'profile-stats');
    [[data.stats.runs,'ROUNDS PLAYED'],[data.stats.gamesPlayed,'GAMES TRIED'],[data.stats.totalScore,'TOTAL POINTS']].forEach(([value,label])=>{
      const stat = el('div'); stat.append(el('strong',Number(value).toLocaleString()),el('small',label)); stats.append(stat);
    });
    const bests = el('ul',undefined,'profile-bests');
    data.bests.forEach(best => { const li=el('li');li.append(el('span',games[best.game] || best.game),el('b',Number(best.score).toLocaleString()+' pts'));bests.append(li); });
    const logout = el('button','Disconnect Discord ↗','text-link profile-signout');logout.type='button';
    logout.addEventListener('click',async()=>{
      logout.disabled=true;
      try { await api('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':session.csrfToken}});location.reload(); }
      catch(error){byId('play-message').textContent=error.message;logout.disabled=false;}
    });
    box.replaceChildren(identity,stats,bests,logout); renderAchievements(data.achievements);
  } catch(error){box.replaceChildren(el('p',error.message,'notice'));}
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click',()=>{
  const category=button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));});
  document.querySelectorAll('.game-card').forEach(card=>{card.hidden=category!=='all'&&card.dataset.category!==category;});
}));
document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{
  period=button.dataset.period;
  document.querySelectorAll('[data-period]').forEach(tab=>{const active=tab===button;tab.classList.toggle('active',active);tab.setAttribute('aria-pressed',String(active));});
  loadBoard();
}));
byId('board-game').addEventListener('change',loadBoard);
byId('refresh-board').addEventListener('click',loadBoard);
byId('account-chip').addEventListener('click',()=>byId('profile').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
document.querySelectorAll('.discord-login').forEach(link=>link.addEventListener('click',event=>{
  if(!sessionAvailable || !session.configured){event.preventDefault();login();}
}));
document.querySelectorAll('[data-game]').forEach(button=>button.addEventListener('click',async(event)=>{
  event.preventDefault();
  const game=button.dataset.game;
  button.setAttribute('aria-busy','true');
  await loadSession();
  button.removeAttribute('aria-busy');
  if(!session.user){login();return;}
  if(game==='sesh-signal'){location.assign('/#sesh-signal');return;}
  const opening=++gameOpening;
  try{
    const {mountGame}=await import('/arcade-games.js');
    if(opening!==gameOpening)return;
    if(cleanupGame)cleanupGame();
    byId('active-game-title').textContent=games[game];
    showDialog(byId('game-dialog'));
    const cleanup=await mountGame(byId('game-stage'),game,session);
    if(opening!==gameOpening || !byId('game-dialog').open){cleanup?.();return;}
    cleanupGame=cleanup;
  }catch(error){byId('play-message').textContent=error.message||'The game could not load. Please try again.';}
}));
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>byId(button.dataset.close).close()));
byId('game-dialog').addEventListener('close',()=>{gameOpening++;cleanupGame?.();cleanupGame=null;});
window.addEventListener('arcade:score-saved',()=>{loadBoard();loadProfile();});
const authError = new URLSearchParams(location.search).get('auth');
if(authError){byId('play-message').textContent='Discord sign-in did not complete. Please try connecting again.';history.replaceState(null,'',location.pathname+location.hash);}
renderAchievements();
await Promise.allSettled([loadSession().then(loadProfile),loadBoard()]);

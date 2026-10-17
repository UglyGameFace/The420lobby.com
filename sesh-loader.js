/* Public sign-in gate. The playable Sesh Signal script is served only to sessions. */
(async function () {
  'use strict';
  const start = document.getElementById('sesh-start');
  const status = document.getElementById('sesh-auth-status');
  const login = document.getElementById('sesh-login');
  if (!start || !status || !login) return;
  start.disabled = true;
  try {
    const response = await fetch('/api/session', {credentials:'same-origin', cache:'no-store', signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw new Error('session_unavailable');
    const session = await response.json();
    if (!session.user) {
      start.textContent = 'SIGN IN TO PLAY';
      status.textContent = session.configured ? 'Connect Discord to play Sesh Signal and save your verified scores.' : 'Discord sign-in is awaiting server configuration. Games are locked until sign-in is available.';
      if (!session.configured) {
        login.setAttribute('aria-disabled','true');
        login.addEventListener('click',event=>{event.preventDefault();status.textContent='Discord sign-in is awaiting server configuration. Please check back soon.';});
      }
      return;
    }
    login.hidden = true;
    status.textContent = 'Signed in as ' + session.user.username + '. Your best scores follow your Discord profile.';
    const script = document.createElement('script');
    script.src = '/sesh-signal.js';
    script.addEventListener('error',()=>{status.textContent='Sesh Signal could not load. Please reload and try again.';});
    document.head.append(script);
  } catch {
    start.textContent='SIGN-IN UNAVAILABLE';
    status.textContent='The arcade service is unavailable. Please try again later.';
    login.setAttribute('aria-disabled','true');
    login.addEventListener('click',event=>event.preventDefault());
  }
})();

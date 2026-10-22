import React, {useCallback, useEffect, useRef, useState} from 'react';

type Connection = {saveData?:boolean;addEventListener?:(type:string,listener:()=>void)=>void;removeEventListener?:(type:string,listener:()=>void)=>void};

export default function SiteHeader() {
  const [menuOpen,setMenuOpen]=useState(false);
  const [effectsEnabled,setEffectsEnabled]=useState(true);
  const [reducedEffects,setReducedEffects]=useState(false);
  const shellRef=useRef<HTMLDivElement>(null);
  const closeMenu=useCallback(()=>setMenuOpen(false),[]);

  useEffect(()=>{
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')closeMenu();};
    const closeOnOutside=(event:PointerEvent)=>{
      if(!shellRef.current?.contains(event.target as Node))closeMenu();
    };
    const closeOnResize=()=>{if(window.innerWidth>1050)closeMenu();};
    window.addEventListener('pageshow',closeMenu);
    window.addEventListener('resize',closeOnResize);
    document.addEventListener('keydown',closeOnEscape);
    document.addEventListener('pointerdown',closeOnOutside);
    return()=>{
      window.removeEventListener('pageshow',closeMenu);
      window.removeEventListener('resize',closeOnResize);
      document.removeEventListener('keydown',closeOnEscape);
      document.removeEventListener('pointerdown',closeOnOutside);
    };
  },[closeMenu]);

  useEffect(()=>{
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection=(navigator as Navigator & {connection?:Connection}).connection;
    const update=()=>{
      const limited=motion.matches||Boolean(connection?.saveData);
      setReducedEffects(limited);
      if(limited)setEffectsEnabled(false);
    };
    update();
    motion.addEventListener('change',update);
    connection?.addEventListener?.('change',update);
    return()=>{
      motion.removeEventListener('change',update);
      connection?.removeEventListener?.('change',update);
    };
  },[]);

  useEffect(()=>{
    document.documentElement.classList.toggle('fx-off',!effectsEnabled);
    // The homepage's existing smoke-brand.js controller owns still/motion selection.
    document.dispatchEvent(new Event('lobby:smoke-refresh'));
    return()=>document.documentElement.classList.remove('fx-off');
  },[effectsEnabled]);

  return <header className="site-header" id="top">
    <div className="header-shell shell" ref={shellRef}>
      <a className="logo brand-lockup" href="/" aria-label="The 420 Lobby home">
        <span className="logo-type logo-prefix brand-lockup__the">THE</span>
        <span className="brand-lockup__smoke">
          <img className="brand-smoke-image"
            src="/assets/lobby-smoke-420-still.webp?v=20261017-smoke-flow4"
            data-smoke-motion="/assets/lobby-smoke-420-loop.webp?v=20261017-smoke-flow4"
            data-smoke-still="/assets/lobby-smoke-420-still.webp?v=20261017-smoke-flow4"
            alt="" width={280} height={176} decoding="async"/>
        </span>
        <span className="logo-type logo-suffix brand-lockup__lobby">LOBBY</span>
      </a>
      <nav className={'desktop-nav'+(menuOpen?' open':'')} id="primary-nav" aria-label="Main navigation">
        <a href="/#vibe" onClick={closeMenu}>THE VIBE</a>
        <a href="/#experiences" onClick={closeMenu}>WHAT WE DO</a>
        <a href="/arcade.html#games" aria-current="page" onClick={closeMenu}>PLAY THE ARCADE</a>
        <a href="/#after-dark" onClick={closeMenu}>AFTER DARK</a>
        <a className="nav-join" href="https://discord.gg/the420lobby" target="_blank" rel="noopener noreferrer" onClick={closeMenu}>
          JOIN THE SERVER <span aria-hidden="true">↗</span>
        </a>
      </nav>
      <div className="header-actions">
        <button id="fx-toggle" className="fx-toggle" type="button"
          aria-pressed={effectsEnabled} aria-label="Toggle visual effects"
          disabled={reducedEffects} title={reducedEffects?'Effects disabled by reduced-motion or data-saving preference':'Toggle animations'}
          onClick={()=>setEffectsEnabled(value=>!value)}>
          <span className="fx-switch" aria-hidden="true"><span className="fx-knob"/></span>
          <span id="fx-label">{reducedEffects?'LOW MOTION':effectsEnabled?'EFFECTS ON':'EFFECTS OFF'}</span>
        </button>
        <button id="menu-toggle" className="menu-toggle" type="button"
          aria-label={menuOpen?'Close navigation':'Open navigation'} aria-controls="primary-nav"
          aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}>
          <span/><span/>
        </button>
      </div>
    </div>
  </header>;
}

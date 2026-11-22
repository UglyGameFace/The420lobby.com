import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('initial page load preserves an opened menu; BFCache restore and dismissal still close it',()=>{
  function target(){
    const listeners=new Map(),attributes=new Map(),classes=new Set();
    const element={
      addEventListener(name,fn){listeners.set(name,fn);},
      setAttribute(name,value){attributes.set(name,value);},
      querySelectorAll(){return [];},contains(other){return other===element;},
      classList:{add:value=>classes.add(value),remove:value=>classes.delete(value),contains:value=>classes.has(value),toggle(value,force){const next=force??!classes.has(value);if(next)classes.add(value);else classes.delete(value);return next;}},
      style:{setProperty(){}},
      fire(name,event={}){listeners.get(name)?.(event);},
      attribute:name=>attributes.get(name)
    };
    return element;
  }
  const menu=target(),button=target(),root=target(),window=target(),document=target();
  Object.assign(window,{innerWidth:390,innerHeight:844,scrollY:0,pageYOffset:0,
    matchMedia(query){return {matches:query.includes('prefers-reduced-motion'),addEventListener(){}};}});
  root.scrollHeight=844;
  Object.assign(document,{documentElement:root,getElementById:id=>id==='menu-toggle'?button:id==='primary-nav'?menu:null});
  runInNewContext(readFileSync(new URL('../script.js',import.meta.url),'utf8'),{
    window,document,navigator:{connection:{saveData:false}},requestAnimationFrame:fn=>fn()
  });
  assert.equal(button.attribute('aria-expanded'),'false');
  button.fire('click');assert.equal(button.attribute('aria-expanded'),'true');
  window.fire('pageshow',{persisted:false});assert.equal(button.attribute('aria-expanded'),'true');
  window.fire('pageshow',{persisted:true});assert.equal(button.attribute('aria-expanded'),'false');
  button.fire('click');document.fire('pointerdown',{target:button});assert.equal(button.attribute('aria-expanded'),'true');
  document.fire('pointerdown',{target:{}});assert.equal(button.attribute('aria-expanded'),'false');
  button.fire('click');document.fire('keydown',{key:'Escape'});assert.equal(button.attribute('aria-expanded'),'false');
  button.fire('click');window.innerWidth=1200;window.fire('resize');assert.equal(button.attribute('aria-expanded'),'false');
});

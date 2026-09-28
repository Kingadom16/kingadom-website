// Non-browser integration checks of the actual script and HTML.
// Timers, media, geometry and animation completion are controlled by this harness.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
const code = fs.readFileSync('script.js', 'utf8');
const voidTags = new Set(['meta','link','img','input','source','br','hr']);
class Element {
  constructor(tag, attrs = {}) {
    this.tagName = tag; this.attrs = attrs; this.children = []; this.listeners = {};
    this.style = { setProperty: (k,v) => this.style[k]=v, removeProperty: k=>delete this.style[k] };
    this.classList = { contains: c=>this.classes.has(c), add: (...cs)=>cs.forEach(c=>this.classes.add(c)),
      remove: (...cs)=>cs.forEach(c=>this.classes.delete(c)), toggle: (c,force)=>{const next=force??!this.classes.has(c);next?this.classes.add(c):this.classes.delete(c);return next;} };
    this.classes = new Set((attrs.class||'').split(/\s+/).filter(Boolean));
    this.dataset = Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5),v]));
    this.hidden = 'hidden' in attrs; this.value = attrs.value || ''; this.open = false; this.paused = true; this.readyState = 2;
    this.complete = false; this.naturalWidth = 100; this.offsetTop = 0;
  }
  get className(){return [...this.classes].join(' ')}
  set className(v){this.classes=new Set(v.split(' '))}
  get firstChild(){return this.children[0]}
  append(child){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child)}
  setAttribute(k,v){this.attrs[k]=String(v)}
  getAttribute(k){return this.attrs[k]??null}
  removeAttribute(k){delete this.attrs[k]}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
  async fire(type,options={}){const event={target:this,currentTarget:this,preventDefault(){},...options};await Promise.all((this.listeners[type]||[]).map(fn=>fn(event)))}
  contains(el){return el===this||this.children.some(c=>c.contains(el))}
  matches(selector){
    const attr=selector.match(/\[([^\]^=]+)(\^?=)?"?([^\]"]*)"?\]/);
    let core=selector.replace(/\[[^\]]+\]/g,'');
    if(attr){const value=this.getAttribute(attr[1]);if(value===null)return false;if(attr[2]==='='&&value!==attr[3])return false;if(attr[2]==='^='&&!value.startsWith(attr[3]))return false;}
    const tag=core.match(/^[\w-]+/);if(tag&&tag[0]!==this.tagName)return false;
    const id=core.match(/#([\w-]+)/);if(id&&this.attrs.id!==id[1])return false;
    return [...core.matchAll(/\.([\w-]+)/g)].every(m=>this.classes.has(m[1]));
  }
  closest(selector){for(let el=this;el;el=el.parentElement)if(selector.split(',').some(s=>el.matches(s.trim())))return el;return null}
  querySelectorAll(selector){
    const descendants=[];const walk=el=>el.children.forEach(child=>{descendants.push(child);walk(child)});walk(this);
    return descendants.filter(el=>selector.split(',').some(group=>{
      const parts=group.trim().split(/\s+(>)?\s*/).filter(Boolean);let cursor=el;
      if(!cursor.matches(parts.pop()))return false;
      while(parts.length){let rule=parts.pop();if(rule==='>'){cursor=cursor.parentElement;rule=parts.pop();if(!cursor?.matches(rule))return false;}else{cursor=cursor.parentElement;while(cursor&&!cursor.matches(rule))cursor=cursor.parentElement;if(!cursor)return false;}}
      return true;
    }));
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null}
  getBoundingClientRect(){return {top:this.offsetTop,left:0,right:500,bottom:this.offsetTop+300,width:500,height:300}}
  focus(){this.document.activeElement=this}
  scrollIntoView(){}
  select(){this.selected=true}
  play(){this.paused=false;return Promise.resolve()}
  pause(){this.paused=true}
  load(){}
  reportValidity(){return true}
  showModal(){this.open=true}
  close(){this.open=false;this.fire('close')}
  getAnimations(){return []}
  animate(){return {finished:Promise.resolve(),cancel(){},pause(){},play(){}}}
}
function createDocument(){
  const doc=new Element('document');let parent=doc;
  for(const token of html.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>/g)){
    if(token.startsWith('<!'))continue;
    const closing=token.match(/^<\/([\w-]+)/);if(closing){while(parent!==doc&&parent.tagName!==closing[1])parent=parent.parentElement;if(parent!==doc)parent=parent.parentElement;continue;}
    const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;
    const attrs={};for(const m of token.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:="([^"]*)")?/g))attrs[m[1]]=m[2]??'';
    const el=new Element(tag,attrs);el.document=doc;parent.append(el);if(!voidTags.has(tag))parent=el;
  }
  doc.documentElement=doc.querySelector('html');doc.documentElement.scrollHeight=8000;
  doc.createElement=tag=>{const el=new Element(tag);el.document=doc;return el};doc.getElementById=id=>doc.querySelector('#'+id);
  doc.querySelectorAll('section').forEach((el,i)=>el.offsetTop=i*800);
  return doc;
}
async function scenario({reduced=false,fine=true,observer=true,clipboard=true,saveData=false}={}){
  const document=createDocument(),timers=new Map(),frames=new Map();let id=0;
  const mq={reduced:{matches:reduced,addEventListener(){}},fine:{matches:fine,addEventListener(){}}};
  const window=new Element('window');window.matchMedia=q=>q.includes('reduced-motion')?mq.reduced:mq.fine;window.location={href:''};
  class IO{constructor(fn){this.fn=fn}observe(target){this.fn([{target,isIntersecting:true}])}unobserve(){}disconnect(){}}
  // Observers deliver asynchronously in the browser; queue initial notifications.
  const observerQueue=[];IO.prototype.observe=function(target){observerQueue.push(()=>this.fn([{target,isIntersecting:true}]))};
  let copied='';
  const context={document,window,Element,console,navigator:clipboard?{clipboard:{writeText:async text=>{copied=text}}}:{},innerWidth:1280,innerHeight:800,scrollY:0,
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:i=>timers.delete(i),
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:i=>frames.delete(i),
    FormData:class{constructor(form){this.form=form}entries(){return [['name','Test'],['email','test@example.com'],['message','Hello & thanks?'],['service',this.form.querySelector('select[name="service"]').value],['reference',this.form.querySelector('#project-reference').value]][Symbol.iterator]()}}};
  if(observer){context.IntersectionObserver=IO;window.IntersectionObserver=IO;}
  context.navigator.connection={saveData};
  vm.runInNewContext(code,context,{filename:'script.js'});
  await document.fire('DOMContentLoaded');observerQueue.forEach(fn=>fn());
  const settleFrames=()=>{for(let i=0;i<300&&frames.size;i++){const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());}assert.equal(frames.size,0,'pointer frame loop stops at rest')};
  settleFrames();
  const timer=[...timers.values()].find(t=>t.ms===1450);timer?.fn();
  [...timers.values()].filter(t=>t.ms===900).forEach(t=>t.fn());
  assert(document.documentElement.classList.contains('page-ready'),'intro releases without load event');
  assert(document.querySelector('main').inert===false,'main becomes interactive');
  assert.equal(document.querySelectorAll('.equip > .floating-visual').length,6);
  assert.equal(document.querySelectorAll('.app-cloud > span > .floating-visual').length,6);
  await document.querySelector('[data-filter="events"]').fire('click');
  const shown=()=>document.querySelectorAll('.project-card').filter(c=>['events','editing','social'].includes(c.dataset.category)&&!c.classList.contains('hidden'));
  assert.equal(shown().length,7,'events contains two awards films and five new event films');
  const events=document.querySelector('[data-filter="events"]'),editing=document.querySelector('[data-filter="editing"]');
  await Promise.all([editing.fire('click'),events.fire('click'),editing.fire('click')]);
  assert.equal(shown().length,8,'rapid filter changes keep the final selection');
  assert(shown().every(c=>c.dataset.category==='editing'));
  const card=shown()[0],video=card.querySelector('video');
  await window.fire('pointermove',{target:card.querySelector('.play'),pointerType:fine?'mouse':'touch',clientX:120,clientY:100});settleFrames();
  context.scrollY=1000;await window.fire('scroll');settleFrames();
  assert(document.querySelector('.scroll-progress span').style.transform.startsWith('scaleX('));
  await card.fire('pointerenter',{pointerType:fine?'mouse':'touch'});
  assert.equal(video.paused,true,'brief fly-by hovers do not start downloads');
  for(const [key,timer] of [...timers])if(timer.ms===250){timers.delete(key);timer.fn();}
  assert.equal(video.paused,reduced||!fine||saveData,'automatic previews respect motion, touch, and Data Saver');
  if(!reduced&&fine&&!saveData)assert.equal(video.src,video.dataset.preview,'hover requests the tiny preview, not the full film');
  await card.fire('click',{target:card.querySelector('.play')});
  assert(document.querySelector('dialog').open);
  assert(video.paused,'preview pauses before full film opens');
  assert.equal(document.querySelector('#viewer-position').textContent,'1 / 8');
  assert.equal(document.querySelector('#previous-film').disabled,true);
  await document.querySelector('#next-film').fire('click');
  assert.equal(document.querySelector('#modal-title').textContent,'Ready Player One');
  await document.querySelector('dialog').fire('keydown',{key:'ArrowRight',target:document.querySelector('#next-film')});
  assert.equal(document.querySelector('#modal-title').textContent,'Bombele — Black &amp; White');
  await document.querySelector('#previous-film').fire('click');
  await document.querySelector('#book-project').fire('click');
  assert.equal(document.querySelector('#project-reference').value,'Ready Player One');
  assert.equal(document.querySelector('select[name="service"]').value,'Video editing');
  assert(!document.querySelector('dialog').open,'film reference booking closes viewer');
  assert(!document.querySelector('#booking-selection').hidden);
  await card.fire('click',{target:card.querySelector('.play')});
  await document.querySelector('dialog').fire('cancel');
  assert(!document.querySelector('dialog').open,'Escape closes viewer');
  assert(document.querySelector('#modal-video').paused);
  await document.querySelector('.menu-toggle').fire('click');
  assert.equal(document.querySelector('.menu-toggle').getAttribute('aria-expanded'),'true');
  await document.fire('keydown',{key:'Escape'});
  assert.equal(document.querySelector('.menu-toggle').getAttribute('aria-expanded'),'false');
  assert.equal(document.querySelector('#booking-whatsapp').getAttribute('type'),'submit');
  assert(document.querySelector('#booking-whatsapp').classList.contains('button'));
  assert.equal(document.querySelector('#booking-email').getAttribute('type'),'button');
  await document.querySelector('#booking-email').fire('click');
  assert(window.location.href.startsWith('mailto:adombrobbey@gmail.com?'));
  assert(window.location.href.includes('%26'),'form body remains encoded');
  assert(decodeURIComponent(window.location.href).includes('FILM REFERENCE: Ready Player One'));
  assert(!document.querySelector('#form-confirmation').hidden);
  await document.querySelector('#clear-reference').fire('click');
  assert.equal(document.querySelector('#project-reference').value,'');
  const bookings=document.querySelectorAll('.service-book');assert.equal(bookings.length,6);
  for(const button of bookings){await button.fire('click');assert.equal(document.querySelector('select[name="service"]').value,button.dataset.service);assert.equal(button.getAttribute('aria-pressed'),'true');}
  await document.querySelector('#booking-form').fire('submit');
  assert(window.location.href.startsWith('https://wa.me/233545196838?text='));
  assert(decodeURIComponent(window.location.href).includes('SERVICE: Promotional video'));
  assert(document.querySelector('#form-confirmation').textContent.includes('Press Send in WhatsApp'));
  assert(document.querySelector('#form-confirmation').textContent.includes('only confirmed after'));
  await document.querySelector('#copy-email').fire('click');
  if(clipboard)assert.equal(copied,'adombrobbey@gmail.com');
  else {assert(!document.querySelector('#copy-fallback').hidden);assert.equal(document.querySelector('#copy-fallback').value,'adombrobbey@gmail.com');assert(document.querySelector('#copy-fallback').selected);}
  await document.querySelector('#copy-request').fire('click');
  if(clipboard)assert(copied.includes('SERVICE: Promotional video'));
  if(!reduced){await document.querySelector('.motion-toggle').fire('click');assert(document.documentElement.classList.contains('motion-paused'));assert(document.querySelectorAll('.reveal-pending').length===0);}
  document.hidden=true;await document.fire('visibilitychange');assert.equal(frames.size,0);
  console.log('PASS',JSON.stringify({reduced,fine,observer,clipboard}));
}
(async()=>{
  await scenario();await scenario({reduced:true});await scenario({fine:false,clipboard:false});await scenario({observer:false});await scenario({saveData:true});
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'IDs are unique');
  for(const m of html.matchAll(/href="#([^"]+)"/g))assert(ids.includes(m[1]),'missing section '+m[1]);
  for(const m of html.matchAll(/data-video="([^"]+)"/g)){if(m[1].startsWith('videos/event-')||m[1].startsWith('videos/editing-'))assert(fs.existsSync(m[1]),'missing supplied video '+m[1]);}
  console.log('PASS navigation and supplied video references');
})().catch(error=>{console.error(error);process.exitCode=1});

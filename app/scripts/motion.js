(() => {
  'use strict';
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const app=qs('#app');
  let current='welcome';
  let animating=false;

  function ease(t){return 1-Math.pow(1-t,4)}
  function toast(title,detail=''){
    const stack=qs('#toast-stack'); if(!stack)return;
    const el=document.createElement('div');el.className='ibpv-toast';
    el.innerHTML=`<strong>${title}</strong>${detail?`<span>${detail}</span>`:''}`;
    stack.appendChild(el);setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(18px)';setTimeout(()=>el.remove(),280)},2800);
  }

  function tagAnimatedElements(){
    qsa('.flow-section').forEach(section=>{
      const items=qsa('.eyebrow,h1,h2,h3,p,blockquote,.welcome-logo,.primary-btn,.text-btn,.profile-card,.stack-form',section);
      items.forEach((el,i)=>{el.dataset.animate='';el.style.setProperty('--delay',`${Math.min(i*85,510)}ms`)})
    })
  }

  function updateDots(name){qsa('.flow-dot').forEach(b=>b.classList.toggle('active',b.dataset.target===name))}
  function updateSharedBrand(name){qs('#shared-brand')?.classList.toggle('visible',name!=='welcome')}

  function paintParallax(start,end,progress,targetSection){
    const direction=end>start?1:-1;
    const sections=qsa('.flow-section:not(.flow-route-hidden)');
    sections.forEach(section=>{
      const center=section.offsetTop+section.offsetHeight/2;
      const viewportCenter=(start+(end-start)*progress)+app.clientHeight/2;
      const delta=(center-viewportCenter)/app.clientHeight;
      const clamped=Math.max(-1.25,Math.min(1.25,delta));
      section.style.setProperty('--section-y',`${clamped*38}px`);
      section.style.setProperty('--section-scale',String(1-Math.min(Math.abs(clamped)*.035,.04)));
      section.style.setProperty('--section-opacity',String(1-Math.min(Math.abs(clamped)*.3,.42)));
    });
    const one=qs('.ambient-orb.one'),two=qs('.ambient-orb.two');
    if(one)one.style.transform=`translate3d(0,${-(start+(end-start)*progress)*.04}px,0)`;
    if(two)two.style.transform=`translate3d(0,${-(start+(end-start)*progress)*.075}px,0)`;
    if(targetSection)targetSection.classList.add('section-visible');
  }

  function scrollToSection(name,instant=false){
    const next=qs(`[data-screen="${name}"]`);if(!next||animating)return Promise.resolve(false);
    const start=app.scrollTop,end=next.offsetTop,distance=end-start;
    current=name;updateDots(name);updateSharedBrand(name);
    qsa('.flow-section').forEach(s=>s.classList.remove('section-visible'));
    next.classList.add('section-visible','section-arriving');
    setTimeout(()=>next.classList.remove('section-arriving'),820);
    if(instant||Math.abs(distance)<2){app.scrollTop=end;paintParallax(end,end,1,next);return Promise.resolve(true)}
    animating=true;document.body.classList.add('is-transitioning');
    const duration=Math.max(760,Math.min(1080,Math.abs(distance)*.55));
    const began=performance.now();
    return new Promise(resolve=>{
      function frame(now){
        const p=Math.min(1,(now-began)/duration),e=ease(p);
        app.scrollTop=start+distance*e;paintParallax(start,end,e,next);
        if(p<1){requestAnimationFrame(frame);return}
        app.scrollTop=end;paintParallax(end,end,1,next);
        document.body.classList.remove('is-transitioning');animating=false;resolve(true)
      }
      requestAnimationFrame(frame)
    })
  }

  function morphFrom(source,destination,done){
    const layer=qs('#morph-layer');
    const target=qs(`[data-screen="${destination}"] .glass-card, [data-screen="${destination}"] .center-card`);
    if(!source||!layer||!target){done();return}
    const a=source.getBoundingClientRect();
    layer.style.cssText+=`;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;border-radius:${getComputedStyle(source).borderRadius}`;
    layer.classList.add('active');document.body.classList.add('morphing');
    const isFlow=qsa('.flow-section').some(s=>s.dataset.screen===destination);
    const complete=()=>{layer.classList.remove('active');document.body.classList.remove('morphing');layer.removeAttribute('style')};
    if(isFlow){
      scrollToSection(destination).then(()=>{
        const b=target.getBoundingClientRect();
        requestAnimationFrame(()=>{
          Object.assign(layer.style,{left:`${b.left}px`,top:`${b.top}px`,width:`${b.width}px`,height:`${b.height}px`,borderRadius:getComputedStyle(target).borderRadius,transition:'all 460ms cubic-bezier(.22,1,.36,1)',opacity:'.12'});
          setTimeout(()=>{complete();done()},480)
        })
      });
    }else{
      layer.style.transition='all 380ms cubic-bezier(.22,1,.36,1)';layer.style.transform='scale(1.08)';layer.style.opacity='.2';
      setTimeout(()=>{complete();done()},390)
    }
  }

  function initIntro(){
    const curtain=qs('#intro-curtain');
    const reveal=()=>{if(!window.IBPVSessionGate?.isReady())return;setTimeout(()=>{curtain?.classList.add('is-gone');qs('[data-screen="welcome"]')?.classList.add('section-visible')},120)};
    window.addEventListener('ibpv-session-ready',reveal,{once:true});
    if(window.IBPVSessionGate?.isReady())reveal();
  }

  function initProgress(){
    const progress=qs('#flow-progress');if(!progress)return;
    qsa('.flow-dot',progress).forEach(dot=>dot.addEventListener('click',()=>scrollToSection(dot.dataset.target)));
  }

  function initMagneticButtons(){
    qsa('.primary-btn,.success-btn,.presentation-btn').forEach(btn=>{
      btn.addEventListener('pointermove',e=>{const r=btn.getBoundingClientRect();const x=(e.clientX-r.left-r.width/2)*.055,y=(e.clientY-r.top-r.height/2)*.075;btn.style.transform=`translate(${x}px,${y}px) scale(1.035)`});
      btn.addEventListener('pointerleave',()=>btn.style.transform='')
    })
  }

  window.IBPVMotion={
    scrollToSection,morphFrom,toast,
    setCurrent(name){current=name;updateDots(name);updateSharedBrand(name)},
    isAnimating:()=>animating
  };

  tagAnimatedElements();initIntro();initProgress();initMagneticButtons();
  requestAnimationFrame(()=>{updateDots('welcome');paintParallax(0,0,1,qs('[data-screen="welcome"]'))});
})();

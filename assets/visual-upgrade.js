(() => {
  'use strict';

  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];
  const strip = html => {
    const t = document.createElement('div');
    t.innerHTML = html || '';
    return (t.textContent || '').replace(/\s+/g, ' ').trim();
  };

  /* A gentle, locally generated rain-and-room-tone bed. It starts only after a click. */
  let ctx = null;
  let ambience = null;
  function makeNoise(seconds = 3) {
    const rate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, rate * seconds, rate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      brown = (brown + 0.02 * white) / 1.02;
      data[i] = brown * 3.2;
    }
    return buffer;
  }
  async function toggleAmbience(button) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    if (ambience) {
      ambience.gain.gain.cancelScheduledValues(ctx.currentTime);
      ambience.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + .45);
      const old = ambience;
      ambience = null;
      button.classList.remove('on');
      button.setAttribute('aria-pressed', 'false');
      setTimeout(() => old.nodes.forEach(n => { try { n.stop(); } catch (_) {} }), 520);
      return;
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(.12, ctx.currentTime + 1.2);
    gain.connect(ctx.destination);

    const rain = ctx.createBufferSource();
    rain.buffer = makeNoise(4);
    rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass'; rainFilter.frequency.value = 900;
    const rainGain = ctx.createGain(); rainGain.gain.value = .1;
    rain.connect(rainFilter).connect(rainGain).connect(gain);

    const room = ctx.createBufferSource();
    room.buffer = makeNoise(5); room.loop = true;
    const roomFilter = ctx.createBiquadFilter();
    roomFilter.type = 'lowpass'; roomFilter.frequency.value = 190;
    const roomGain = ctx.createGain(); roomGain.gain.value = .16;
    room.connect(roomFilter).connect(roomGain).connect(gain);

    const drone = ctx.createOscillator();
    drone.type = 'sine'; drone.frequency.value = 48;
    const droneGain = ctx.createGain(); droneGain.gain.value = .035;
    drone.connect(droneGain).connect(gain);
    rain.start(); room.start(); drone.start();
    ambience = { gain, nodes: [rain, room, drone] };
    button.classList.add('on');
    button.setAttribute('aria-pressed', 'true');
  }

  let utterance = null;
  let speechRun = 0;
  function koreanVoice() {
    const voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    const ko = voices.filter(v => /^ko([-_]|$)/i.test(v.lang));
    const score = voice => {
      const name = voice.name.toLowerCase();
      let points = 0;
      if (/natural|neural|premium|enhanced|online/.test(name)) points += 100;
      if (/sora|jihye|sunhi|yuna|google.*한국|google.*korean/.test(name)) points += 45;
      if (!voice.localService) points += 18;
      if (/compact|basic|espeak/.test(name)) points -= 80;
      return points;
    };
    return ko.sort((a,b) => score(b) - score(a))[0] || null;
  }
  function stopSpeech(button) {
    if (!window.speechSynthesis) return;
    speechRun++;
    speechSynthesis.cancel();
    utterance = null;
    qsa('[data-vu-speak].on').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
    if (button) button.classList.remove('on');
  }
  function cleanNarration(text) {
    return String(text || '')
      .replace(/[▶♪●○▪★]/g, ' ')
      .replace(/\b1R\b/gi, '1라운드')
      .replace(/\bGM\b/g, '게임 마스터')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function speechParts(content) {
    const blocks = (Array.isArray(content) ? content : [content])
      .map(cleanNarration).filter(Boolean);
    const parts = [];
    blocks.forEach(block => {
      const sentences = block.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [block];
      sentences.forEach(sentence => {
        const text = sentence.trim();
        if (!text) return;
        if (text.length <= 180) parts.push(text);
        else {
          const chunks = text.match(/.{1,150}(?:\s|,|$)/g) || [text];
          chunks.map(x => x.trim()).filter(Boolean).forEach(x => parts.push(x));
        }
      });
    });
    return parts;
  }
  function speak(content, button) {
    if (!window.speechSynthesis || !content) return;
    if (button && button.classList.contains('on')) { stopSpeech(button); return; }
    stopSpeech();
    const parts = speechParts(content);
    if (!parts.length) return;
    const run = speechRun;
    const voice = koreanVoice();
    if (button) { button.classList.add('on'); button.setAttribute('aria-pressed', 'true'); }
    let index = 0;
    const next = () => {
      if (run !== speechRun || index >= parts.length) {
        if (run === speechRun) stopSpeech(button);
        return;
      }
      utterance = new SpeechSynthesisUtterance(parts[index++]);
      utterance.lang = 'ko-KR';
      utterance.rate = .94;
      utterance.pitch = .99;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      utterance.onend = () => setTimeout(next, 145);
      utterance.onerror = () => stopSpeech(button);
      speechSynthesis.speak(utterance);
    };
    next();
  }
  if (window.speechSynthesis) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

  function wave() { return '<span class="vu-wave" aria-hidden="true"><i></i><i></i><i></i></span>'; }
  function listenBar(readTarget) {
    const bar = document.createElement('div');
    bar.className = 'vu-listenbar';
    bar.innerHTML = `
      <button type="button" data-vu-ambient aria-label="배경 분위기 소리" aria-pressed="false">${wave()}<span class="vu-text">분위기</span></button>
      <button type="button" data-vu-speak aria-label="현재 내용만 읽어주기" aria-pressed="false"><span aria-hidden="true">▶</span> <span class="vu-text">내용 듣기</span></button>`;
    qs('[data-vu-ambient]', bar).onclick = e => toggleAmbience(e.currentTarget);
    qs('[data-vu-speak]', bar).onclick = e => speak(readTarget(), e.currentTarget);
    return bar;
  }

  function initGM() {
    document.body.classList.add('vu-gm');
    const header = qs('.hdr');
    const status = qs('.hdr .st');
    if (header && status) header.insertBefore(listenBar(() => {
      const screen = qs('.scr.on');
      if (!screen) return [];
      if (screen.id === 's-intro') return qsa('.vu-gm-copy h2,.vu-gm-copy p', screen).map(x => x.innerText);
      if (screen.id === 's-pro') return qsa('.pro-voice-copy>span', screen).map(x => x.textContent);
      if (screen.id === 's-round') return qsa('#rname,#rdesc,#script p,#script .warrant', screen).map(x => x.innerText);
      if (screen.id === 's-rev') return qsa('.rvcard h2,.rvcard .rv-narration', screen).map(x => x.textContent);
      return [];
    }), status);

    const intro = qs('#s-intro');
    if (intro) {
      const hero = document.createElement('div');
      hero.className = 'vu-gm-hero';
      hero.innerHTML = `<div class="vu-gm-copy">
        <div class="vu-kicker">CASE 02 · THE MANSION</div>
        <h2>건배가 끝난 뒤,<br>한 사람만 죽었다.</h2>
        <div class="vu-facts"><span>4인 플레이</span><span>약 90분</span><span>추리 난이도 ●●●○○</span></div>
      </div>`;
      intro.insertBefore(hero, intro.firstChild);
    }

    document.addEventListener('click', e => {
      if (e.target.closest('#proPlay,#proStop,#proPrev,#skip,#rvPlay,#rvStop,#rvPrev,#go,#tReset')) stopSpeech();
    });
  }

  const roleBriefs = {
    '윤꽃집':['부부의 단골 꽃집 사장','한소설에게 오래된 원한','백비서에게 숨긴 호감'],
    '한소설':['베스트셀러 추리소설가','죽은 홍대표의 남편','성공 뒤에 감춘 과거'],
    '백비서':['저택을 관리하는 비서','부부의 사정을 가장 잘 앎','흔들리지 않는 표정'],
    '유감독':['소설 영화화의 연출자','파티의 주요 관계자','카메라 밖의 진실을 봄']
  };
  function addCardTools(card) {
    if (card.dataset.vuDone) return;
    const targets = qsa('p,li,.line,.crisis', card).filter(x => strip(x.innerHTML).length > 70);
    if (!targets.length) return;
    card.dataset.vuDone = '1';
    targets.forEach(x => x.classList.add('vu-clamp-target'));
    card.classList.add('vu-clamped');
    const tools = document.createElement('div');
    tools.className = 'vu-card-tools';
    tools.innerHTML = `<button type="button" class="vu-card-listen" data-vu-speak aria-pressed="false">▶ 이 카드 듣기</button><button type="button" class="vu-fold">자세히 보기</button>`;
    qs('.vu-card-listen', tools).onclick = e => speak(card.innerText.replace(/▶ 이 카드 듣기|자세히 보기|간단히 보기/g,''), e.currentTarget);
    qs('.vu-fold', tools).onclick = e => {
      card.classList.toggle('vu-open');
      e.currentTarget.textContent = card.classList.contains('vu-open') ? '간단히 보기' : '자세히 보기';
    };
    card.append(tools);
  }

  function playerBrief() {
    const items = roleBriefs[ME.name] || ME.intro.slice(0,3).map(strip);
    const brief = document.createElement('div');
    brief.className = 'vu-brief';
    brief.setAttribute('aria-label','역할 핵심 요약');
    brief.innerHTML = items.slice(0,3).map((x,i) => `<div class="vu-brief-item" data-no="0${i+1}"><b>${i===0?'WHO':i===1?'TENSION':'SECRET'}</b><span>${x}</span></div>`).join('');
    return brief;
  }

  function enhancePlayerMain() {
    const main = qs('#main');
    if (!main || !main.children.length) return;
    if (qs('.sub', main) && !qs('.vu-brief', main)) main.insertBefore(playerBrief(), main.children[1] || main.firstChild);
    qsa('.card', main).forEach(addCardTools);
  }

  function initPlayer() {
    if (typeof ME === 'undefined') return;
    document.body.classList.add('vu-player');
    const tabs = qs('.tabs');
    if (tabs) {
      const hero = document.createElement('section');
      hero.className = 'vu-player-hero';
      hero.dataset.person = ME.name;
      hero.innerHTML = `<div class="vu-dossier"><div class="vu-dossier-copy">
        <div class="vu-kicker">CONFIDENTIAL · SUSPECT DOSSIER</div>
        <h1>${ME.name}</h1><p>${ME.age}세 · ${ME.job} · 오늘 밤의 용의자</p>
      </div><button type="button" class="vu-card-listen" data-vu-speak aria-pressed="false">▶ 역할 듣기</button></div>`;
      qs('[data-vu-speak]', hero).onclick = e => {
        const briefing = [ME.name, `${ME.age}세 ${ME.job}`, ...(roleBriefs[ME.name] || ME.intro.map(strip))].join('. ');
        speak(briefing, e.currentTarget);
      };
      tabs.before(hero);
    }
    const main = qs('#main');
    if (main) {
      new MutationObserver(enhancePlayerMain).observe(main, {childList:true,subtree:false});
      enhancePlayerMain();
    }
    document.addEventListener('click', e => {
      if (e.target.closest('.tabs button,.sub button,.bk,.rowbtn,.objc,.hs,.kitem')) stopSpeech();
    });
  }

  if (qs('#s-intro')) initGM();
  else initPlayer();
})();

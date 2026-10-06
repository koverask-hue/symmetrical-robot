import { TOOLS } from './tools.js';

const $ = (id) => document.getElementById(id);

// DOM overlay. Writes are diffed so unchanged text never touches layout.
export class Hud {
  constructor() {
    this.root = $('hud');
    this.el = {
      toolbar: $('toolbar'), health: $('health-fill'), healthText: $('health-text'), objectives: $('objectives'),
      alarm: $('alarm'), alarmTime: $('alarm-time'), prompt: $('prompt'), toasts: $('toasts'), stats: $('stats'),
      markers: $('markers'), phase: $('phase'), hit: $('crosshair'),
    };
    this.cache = new Map();
    this.markerEls = [];
    this.slots = TOOLS.map((t, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<span class="k">${i + 1}</span><span class="n">${t.name}</span><span class="a"></span>`;
      this.el.toolbar.appendChild(d);
      return d;
    });
  }

  set(key, el, prop, value) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'html') el.innerHTML = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'class') el.className = value;
    else if (prop === 'display') el.style.display = value;
  }

  show(on) {
    this.root.hidden = !on;
  }

  tools(current, ammo) {
    TOOLS.forEach((t, i) => {
      const a = ammo[t.key];
      const txt = a === Infinity ? '∞' : t.key === 'cutter' || t.key === 'extinguisher' ? `${Math.ceil(a)}s` : `${a}`;
      this.set('ta' + i, this.slots[i].querySelector('.a'), 'text', txt);
      this.set('tc' + i, this.slots[i], 'class', 'slot' + (i === current ? ' on' : '') + (a <= 0 ? ' empty' : ''));
    });
  }

  health(h) {
    this.set('hp', this.el.health, 'width', `${Math.max(0, h)}%`);
    this.set('hpt', this.el.healthText, 'text', `${Math.ceil(Math.max(0, h))}`);
    this.set('hpc', this.el.health, 'class', h < 35 ? 'low' : '');
  }

  objectives(targets, phase) {
    const rows = targets.map((t) =>
      `<li class="${t.collected ? 'done' : ''} ${t.required ? '' : 'opt'}"><i></i>${t.name}<b>$${t.value.toLocaleString()}</b></li>`).join('');
    const all = targets.filter((t) => t.required).every((t) => t.collected);
    const tail = all ? '<li class="go"><i></i>Reach the getaway van</li>' : '';
    this.set('obj', this.el.objectives, 'html', `<h3>Objectives</h3><ul>${rows}${tail}</ul>`);
    this.set('phase', this.el.phase, 'text', phase === 'plan' ? 'PLANNING — no clock until you grab something' : '');
  }

  alarm(t) {
    if (t === null) {
      this.set('al', this.el.alarm, 'display', 'none');
      return;
    }
    this.set('al', this.el.alarm, 'display', 'flex');
    this.set('alt', this.el.alarmTime, 'text', t.toFixed(1));
    this.set('alc', this.el.alarm, 'class', t < 10 ? 'urgent' : '');
  }

  prompt(text) {
    this.set('pr', this.el.prompt, 'text', text || '');
  }

  stats(text) {
    this.set('st', this.el.stats, 'text', text);
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2200);
    setTimeout(() => d.remove(), 2800);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  hitmark() {
    this.el.hit.classList.remove('hit');
    void this.el.hit.offsetWidth;
    this.el.hit.classList.add('hit');
  }

  // list: [{x, y, label, sub, cls, onScreen}] in CSS pixels
  markers(list) {
    while (this.markerEls.length < list.length) {
      const d = document.createElement('div');
      d.className = 'marker';
      d.innerHTML = '<span class="l"></span><span class="s"></span>';
      this.el.markers.appendChild(d);
      this.markerEls.push(d);
    }
    this.markerEls.forEach((d, i) => {
      const m = list[i];
      if (!m) {
        d.style.display = 'none';
        return;
      }
      d.style.display = '';
      d.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
      d.className = 'marker ' + m.cls + (m.onScreen ? '' : ' edge');
      d.firstChild.textContent = m.label;
      d.lastChild.textContent = m.sub;
    });
  }
}

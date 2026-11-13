import { BALANCE, type Outcome } from '../game/config/balance';
import { MEDALS, type Medal } from '../game/systems/medals';
import { losses, wins, type SaveData } from '../storage/save';

export type Screen = 'loading' | 'title' | 'intro' | 'play' | 'result';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} introuvable`);
  return el as T;
};

const fr = (n: number) => n.toLocaleString('fr-FR');

export interface ResultView {
  outcome: Outcome;
  message: string;
  score: number;
  record: boolean;
  elapsed: number;
  power: number;
  resists: number;
  newMedals: Medal[];
}

export class UI {
  readonly app = $<HTMLDivElement>('app');
  readonly stage = $<HTMLDivElement>('stage');
  readonly startBtn = $<HTMLButtonElement>('start');
  readonly pumpBtn = $<HTMLButtonElement>('pump');
  readonly openBtn = $<HTMLButtonElement>('open');
  readonly retryBtn = $<HTMLButtonElement>('retry');
  readonly shareBtn = $<HTMLButtonElement>('share');
  readonly menuBtn = $<HTMLButtonElement>('menu');
  readonly muteBtn = $<HTMLButtonElement>('mute');

  private loading = $('loading');
  private intro = $('intro');
  private go = $('go');
  private timer = $('timer');
  private timerValue = $('timer-value');
  private banner = $('banner');
  private barks = $('barks');
  private gauge = $('gauge');
  private gaugeFill = $('gauge-fill');
  private gaugeNeedle = $('gauge-needle');
  private gaugePct = $('gauge-pct');
  private stats = $('stats');
  private medals = $('medals');
  private medalCount = $('medal-count');
  private medalInfo = $('medal-info');
  private resultMessage = $('result-message');
  private resultScore = $('result-score');
  private resultRecord = $('result-record');
  private resultDetail = $('result-detail');
  private newMedals = $('new-medals');

  private lastPct = -1;
  private lastSec = -1;

  constructor() {
    // zones de la jauge alignées sur les réglages du jeu
    const z = BALANCE.zones;
    const root = document.documentElement.style;
    root.setProperty('--z-perfect', `${z.perfectMin}%`);
    root.setProperty('--z-chaos', `${z.perfectMax + 1}%`);
    root.setProperty('--z-boom', `${z.chaosMax + 1}%`);
  }

  get screen(): Screen {
    return this.app.dataset.screen as Screen;
  }

  setScreen(s: Screen): void {
    this.app.dataset.screen = s;
  }

  /** Manche terminée : le chrono laisse la place au verdict. */
  setEnded(ended: boolean): void {
    if (ended) this.app.dataset.ended = '1';
    else delete this.app.dataset.ended;
  }

  setLoading(text: string, error = false): void {
    this.loading.textContent = text;
    this.loading.classList.toggle('is-error', error);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.setAttribute('aria-pressed', String(muted));
    this.muteBtn.classList.toggle('is-muted', muted);
    this.muteBtn.setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
  }

  // ------------------------------------------------------------ HUD
  updateHud(power: number, timeLeft: number): void {
    const pct = Math.floor(power);
    this.gaugeFill.style.width = `${power}%`;
    this.gaugeNeedle.style.left = `${power}%`;
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.gaugePct.textContent = `${pct}%`;
      this.gauge.setAttribute('aria-valuenow', String(pct));
      const z = BALANCE.zones;
      const zone = pct < z.perfectMin ? 'resist' : pct <= z.perfectMax ? 'perfect' : pct <= z.chaosMax ? 'chaos' : 'boom';
      this.gauge.dataset.zone = zone;
      this.openBtn.dataset.zone = zone;
    }
    const sec = Math.ceil(timeLeft);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.timerValue.textContent = String(sec).padStart(2, '0');
      this.timer.classList.toggle('is-urgent', sec <= 5);
    }
  }

  // ------------------------------------------------------------ briefing
  clearIntro(): void {
    this.intro.innerHTML = '';
    this.go.textContent = '';
    this.go.classList.remove('is-on');
  }

  addIntroLine(): HTMLElement {
    const p = document.createElement('p');
    this.intro.appendChild(p);
    return p;
  }

  showGo(text: string): void {
    this.intro.innerHTML = '';
    this.go.textContent = text;
    this.go.classList.remove('is-on');
    void this.go.offsetWidth;
    this.go.classList.add('is-on');
  }

  // ------------------------------------------------------------ incrustations
  showBanner(text: string, kind: Outcome | 'resist', sticky: boolean): void {
    this.banner.textContent = text;
    this.banner.className = `banner is-${kind}`;
    void this.banner.offsetWidth;
    this.banner.classList.add(sticky ? 'is-sticky' : 'is-flash');
  }

  hideBanner(): void {
    this.banner.className = 'banner';
    this.banner.textContent = '';
  }

  bark(text: string, xPct: number, yPct: number, who: 'chuck' | 'jar'): void {
    const el = document.createElement('span');
    el.className = `bark bark-${who}`;
    el.textContent = text;
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    this.barks.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    window.setTimeout(() => el.remove(), 2000);
  }

  clearBarks(): void {
    this.barks.innerHTML = '';
  }

  // ------------------------------------------------------------ écran titre
  renderTitle(save: SaveData): void {
    const rows: [string, string][] = [
      ['MEILLEUR SCORE', fr(save.best)],
      ['VICTOIRES', fr(wins(save))],
      ['DÉFAITES', fr(losses(save))],
      ['CUISINES DÉTRUITES', fr(save.explosions)],
    ];
    this.stats.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    this.medalCount.textContent = `${save.medals.length}/${MEDALS.length}`;
    this.medals.innerHTML = '';
    for (const m of MEDALS) {
      const has = save.medals.includes(m.id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `medal${has ? ' is-earned' : ''}`;
      b.textContent = has ? '★' : '?';
      b.setAttribute('aria-label', `${has ? 'Médaille obtenue' : 'Médaille verrouillée'} : ${m.name}. ${m.desc}`);
      const show = () => {
        this.medalInfo.textContent = `${has ? '' : '[VERROUILLÉE] '}${m.name} — ${m.desc}`;
      };
      b.addEventListener('click', show);
      b.addEventListener('focus', show);
      b.addEventListener('pointerenter', show);
      li.appendChild(b);
      this.medals.appendChild(li);
    }
    this.medalInfo.innerHTML = '&nbsp;';
  }

  // ------------------------------------------------------------ écran résultat
  renderResult(r: ResultView): void {
    this.resultMessage.textContent = `« ${r.message} »`;
    this.app.dataset.outcome = r.outcome;
    const won = r.outcome === 'perfect' || r.outcome === 'chaos';
    this.resultScore.textContent = won ? `${fr(r.score)} PTS` : '0 PT';
    this.resultRecord.hidden = !r.record;

    const time = `${r.elapsed.toFixed(1).replace('.', ',')} S`;
    const tries = r.resists > 0 ? ` · ${r.resists} ÉCHEC${r.resists > 1 ? 'S' : ''}` : '';
    const detail: Record<Outcome, string> = {
      perfect: `OUVERT EN ${time} À ${Math.floor(r.power)}%${tries}`,
      chaos: `OUVERT EN ${time} À ${Math.floor(r.power)}%${tries} · DÉGÂTS : MODÉRÉS`,
      explosion: `${Math.floor(r.power)}% DE PUISSANCE. C'ÉTAIT UN BOCAL, CHUCK.`,
      timeout: `20 SECONDES. ${r.resists} TENTATIVE${r.resists > 1 ? 'S' : ''}. ZÉRO CORNICHON.`,
    };
    this.resultDetail.textContent = detail[r.outcome];

    this.newMedals.innerHTML = '';
    for (const m of r.newMedals) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="medal is-earned" aria-hidden="true">★</span><span><b></b><i></i></span>`;
      li.querySelector('b')!.textContent = `MÉDAILLE : ${m.name}`;
      li.querySelector('i')!.textContent = m.desc;
      this.newMedals.appendChild(li);
    }
    this.shareBtn.textContent = 'PARTAGER';
  }
}

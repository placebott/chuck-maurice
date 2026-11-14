import { CUT, judgeCut, toMm, type EndingKind, type Quality } from './config/balance';
import { MEDALS, type Medal } from './systems/medals';
import type { SaucissonSave } from './save';

export type Screen = 'loading' | 'title' | 'intro' | 'play' | 'result';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} introuvable`);
  return el as T;
};

const fr = (n: number) => n.toLocaleString('fr-FR');
const mm = (px: number) => `${toMm(px).toFixed(1).replace('.', ',')} MM`;
const pct = (px: number) => `${(px / CUT.disaster) * 100}%`;

export interface ResultView {
  kind: EndingKind;
  message: string;
  sub: string;
  score: number;
  record: boolean;
  elapsed: number;
  cuts: number;
  counts: Record<Quality, number>;
  bestStreak: number;
  newMedals: Medal[];
}

/** Interface HTML de Saucissonator : mêmes composants et classes CSS qu'Opération Cornichon. */
export class SaucissonUI {
  readonly app = $<HTMLDivElement>('app');
  readonly stage = $<HTMLDivElement>('stage');
  readonly startBtn = $<HTMLButtonElement>('start');
  readonly cutBtn = $<HTMLButtonElement>('cut');
  readonly retryBtn = $<HTMLButtonElement>('retry');
  readonly shareBtn = $<HTMLButtonElement>('share');
  readonly menuBtn = $<HTMLButtonElement>('menu');
  readonly muteBtn = $<HTMLButtonElement>('mute');

  private loading = $('loading');
  private intro = $('intro');
  private go = $('go');
  private timer = $('timer');
  private timerValue = $('timer-value');
  private sliceHud = $('hud-slices');
  private sliceCount = $('slice-count');
  private score = $('score');
  private combo = $('combo');
  private banner = $('banner');
  private barks = $('barks');
  private pips = $('pips');
  private gauge = $('gauge');
  private gaugeFill = $('gauge-fill');
  private gaugeNeedle = $('gauge-needle');
  private gaugeMm = $('gauge-mm');
  private stats = $('stats');
  private medals = $('medals');
  private medalCount = $('medal-count');
  private medalInfo = $('medal-info');
  private resultMessage = $('result-message');
  private resultSub = $('result-sub');
  private resultScore = $('result-score');
  private resultRecord = $('result-record');
  private resultDetail = $('result-detail');
  private newMedals = $('new-medals');

  private lastSec = -1;
  private lastZone = '';
  private lastMm = '';

  constructor() {
    // zones de la jauge alignées sur les réglages du jeu
    const place = (id: string, from: number, to: number) => {
      const el = $(id);
      el.style.left = pct(from);
      el.style.width = pct(to - from);
    };
    place('cz-good', CUT.ideal - CUT.goodTol, CUT.ideal + CUT.goodTol);
    place('cz-perfect', CUT.ideal - CUT.perfectTol, CUT.ideal + CUT.perfectTol);
    place('cz-thick', CUT.ideal + CUT.goodTol, CUT.disaster);
    place('cl-thin', 0, CUT.ideal - CUT.goodTol);
    place('cl-perfect', CUT.ideal - CUT.goodTol, CUT.ideal + CUT.goodTol);
    place('cl-thick', CUT.ideal + CUT.goodTol, CUT.disaster);
    this.gauge.setAttribute('aria-valuemax', String(toMm(CUT.disaster)));
    this.resetRound();
  }

  get screen(): Screen {
    return this.app.dataset.screen as Screen;
  }

  setScreen(s: Screen): void {
    this.app.dataset.screen = s;
  }

  /** Mission terminée : le chrono et les compteurs laissent la place au verdict. */
  setEnded(ended: boolean): void {
    if (ended) this.app.dataset.ended = '1';
    else delete this.app.dataset.ended;
  }

  setTactical(on: boolean): void {
    if (on) this.app.dataset.tactical = '1';
    else delete this.app.dataset.tactical;
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
  resetRound(): void {
    this.pips.innerHTML = '';
    for (let i = 0; i < CUT.slices; i++) this.pips.appendChild(document.createElement('li'));
    this.sliceCount.textContent = '00';
    this.score.textContent = '000000';
    this.updateHud(0, CUT.duration);
  }

  /** À chaque image : épaisseur en cours et chrono. */
  updateHud(thickness: number, timeLeft: number): void {
    const p = Math.min(100, (thickness / CUT.disaster) * 100);
    this.gaugeFill.style.width = `${p}%`;
    this.gaugeNeedle.style.left = `${p}%`;
    const label = mm(thickness);
    if (label !== this.lastMm) {
      this.lastMm = label;
      this.gaugeMm.textContent = label;
      this.gauge.setAttribute('aria-valuenow', toMm(thickness).toFixed(1));
    }
    const zone = judgeCut(thickness);
    if (zone !== this.lastZone) {
      this.lastZone = zone;
      this.gauge.dataset.zone = zone;
      this.cutBtn.dataset.zone = zone;
    }
    const sec = Math.ceil(timeLeft);
    if (sec !== this.lastSec) {
      this.lastSec = sec;
      this.timerValue.textContent = String(sec).padStart(2, '0');
      this.timer.classList.toggle('is-urgent', sec <= 5);
    }
  }

  /** Après chaque coupe : compteur de rondelles, score, pastille de qualité. */
  recordCut(index: number, quality: Quality, total: number, score: number): void {
    this.pips.children[index]?.classList.add(`is-${quality}`);
    this.sliceCount.textContent = String(total).padStart(2, '0');
    this.score.textContent = String(score).padStart(6, '0');
    for (const el of [this.sliceHud, this.score.parentElement!]) {
      el.classList.remove('is-bump');
      void el.offsetWidth;
      el.classList.add('is-bump');
    }
  }

  /** Verdict flottant au-dessus de la planche : qualité, épaisseur mesurée, points. */
  verdict(text: string, quality: Quality, thickness: number, points: number, xPct: number, yPct: number): void {
    const el = document.createElement('span');
    el.className = `verdict is-${quality}`;
    el.textContent = text;
    const small = document.createElement('small');
    small.textContent = `${mm(thickness)} · +${points}`;
    el.appendChild(small);
    this.float(el, xPct, yPct, 900);
  }

  bonus(text: string, xPct: number, yPct: number): void {
    const el = document.createElement('span');
    el.className = 'verdict is-bonus';
    el.textContent = text;
    this.float(el, xPct, yPct, 1150);
  }

  private float(el: HTMLElement, xPct: number, yPct: number, ttl: number): void {
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    this.barks.appendChild(el);
    window.setTimeout(() => el.remove(), ttl);
  }

  showCombo(text: string): void {
    this.combo.textContent = text;
    this.combo.classList.remove('is-on');
    void this.combo.offsetWidth;
    this.combo.classList.add('is-on');
  }

  hideCombo(): void {
    this.combo.classList.remove('is-on');
    this.combo.textContent = '';
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
  showBanner(text: string, kind: EndingKind): void {
    this.banner.textContent = text;
    this.banner.className = `banner is-${kind}`;
    void this.banner.offsetWidth;
    this.banner.classList.add('is-sticky');
  }

  hideBanner(): void {
    this.banner.className = 'banner';
    this.banner.textContent = '';
  }

  bark(text: string, xPct: number, yPct: number, who: 'chuck' | 'boxer'): void {
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

  // ------------------------------------------------------------ écran de lancement
  renderTitle(save: SaucissonSave): void {
    const rows: [string, string][] = [
      ['MEILLEUR SCORE', fr(save.best)],
      ['VICTOIRES', fr(save.wins)],
      ['RONDELLES PARFAITES', fr(save.perfectSlices)],
      ['SAUCISSONS VOLÉS', fr(save.dog)],
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

  // ------------------------------------------------------------ écran de résultat
  renderResult(r: ResultView): void {
    this.resultMessage.textContent = `« ${r.message} »`;
    this.resultSub.textContent = `« ${r.sub} »`;
    this.app.dataset.outcome = r.kind;
    this.resultScore.textContent = `${fr(r.score)} PTS`;
    this.resultRecord.hidden = !r.record;

    const c = r.counts;
    const time = `${r.elapsed.toFixed(1).replace('.', ',')} S`;
    const parts = [
      `${r.cuts}/${CUT.slices} RONDELLES EN ${time}`,
      `PARFAITES ${c.perfect}`,
      `CORRECTES ${c.good}`,
      `ÉPAISSES ${c.thick}`,
      `FINES ${c.thin}`,
      `MEILLEURE SÉRIE ${r.bestStreak}`,
    ];
    this.resultDetail.textContent = parts.join(' · ');

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

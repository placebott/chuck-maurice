import { STORM, type EndingKind, type Phase } from './config/balance';
import { PHASES } from './config/messages';
import { MEDALS, type Medal } from './systems/medals';
import type { OliveSave } from './save';

export type Screen = 'loading' | 'title' | 'intro' | 'play' | 'result';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} introuvable`);
  return el as T;
};

const fr = (n: number) => n.toLocaleString('fr-FR');

export interface ResultView {
  kind: EndingKind;
  lines: string[];
  score: number;
  best: number;
  record: boolean;
  scored: number;
  used: number;
  accuracy: number;
  elapsed: number;
  newMedals: Medal[];
}

/** Interface HTML d'Olive Storm : mêmes composants et classes CSS que les deux autres missions. */
export class OliveUI {
  readonly app = $<HTMLDivElement>('app');
  readonly stage = $<HTMLDivElement>('stage');
  readonly startBtn = $<HTMLButtonElement>('start');
  readonly fireBtn = $<HTMLButtonElement>('fire');
  readonly angleUpBtn = $<HTMLButtonElement>('angle-up');
  readonly angleDownBtn = $<HTMLButtonElement>('angle-down');
  readonly powerUpBtn = $<HTMLButtonElement>('power-up');
  readonly powerDownBtn = $<HTMLButtonElement>('power-down');
  readonly retryBtn = $<HTMLButtonElement>('retry');
  readonly shareBtn = $<HTMLButtonElement>('share');
  readonly menuBtn = $<HTMLButtonElement>('menu');
  readonly muteBtn = $<HTMLButtonElement>('mute');

  private loading = $('loading');
  private intro = $('intro');
  private go = $('go');
  private timer = $('timer');
  private timerValue = $('timer-value');
  private oliveCount = $('olive-count');
  private shotCount = $('shot-count');
  private score = $('score');
  private phaseTag = $('phase-tag');
  private wind = $('wind');
  private windValue = $('wind-value');
  private announceEl = $('announce');
  private yellEl = $('yell');
  private banner = $('banner');
  private barks = $('barks');
  private gauge = $('gauge');
  private gaugeFill = $('gauge-fill');
  private gaugeNeedle = $('gauge-needle');
  private powerValue = $('power-value');
  private angleValue = $('angle-value');
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

  get screen(): Screen {
    return this.app.dataset.screen as Screen;
  }

  setScreen(s: Screen): void {
    this.app.dataset.screen = s;
  }

  setEnded(ended: boolean): void {
    if (ended) this.app.dataset.ended = '1';
    else delete this.app.dataset.ended;
  }

  /** Une olive est en vol : la visée est suspendue. */
  setBusy(busy: boolean): void {
    if (busy) this.app.dataset.busy = '1';
    else delete this.app.dataset.busy;
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
  updateTimer(timeLeft: number): void {
    const sec = Math.ceil(timeLeft);
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    this.timerValue.textContent = String(sec).padStart(2, '0');
    this.timer.classList.toggle('is-urgent', sec <= 5);
  }

  updateCounts(scored: number, shotsLeft: number, score: number, bump = false): void {
    this.oliveCount.textContent = String(scored);
    this.shotCount.textContent = String(shotsLeft);
    this.score.textContent = String(score).padStart(6, '0');
    if (!bump) return;
    for (const el of [this.oliveCount.parentElement!, this.score.parentElement!]) {
      el.classList.remove('is-bump');
      void el.offsetWidth;
      el.classList.add('is-bump');
    }
  }

  setPhase(phase: Phase, windAx: number): void {
    this.phaseTag.textContent = `PHASE ${phase}/3 · ${PHASES[phase].name}`;
    this.wind.hidden = windAx === 0;
    // force affichée de 1 à 5, proportionnelle à l'accélération réelle
    this.windValue.textContent = `FORCE ${Math.max(1, Math.round(Math.abs(windAx) / 20))}`;
  }

  updateAim(angle: number, power: number): void {
    const pct = Math.round(power * 100);
    this.gaugeFill.style.width = `${pct}%`;
    this.gaugeNeedle.style.left = `${pct}%`;
    this.powerValue.textContent = `${pct} %`;
    this.angleValue.textContent = `${Math.round(angle)}°`;
    this.gauge.setAttribute('aria-valuenow', String(pct));
  }

  announce(text: string): void {
    this.announceEl.textContent = text;
    this.announceEl.classList.remove('is-on');
    void this.announceEl.offsetWidth;
    this.announceEl.classList.add('is-on');
  }

  yell(text: string): void {
    this.yellEl.textContent = text;
    this.yellEl.classList.remove('is-on');
    void this.yellEl.offsetWidth;
    this.yellEl.classList.add('is-on');
  }

  /** Compte rendu flottant d'un tir : verdict et détail des points. */
  verdict(text: string, detail: string, scored: boolean, xPct: number, yPct: number): void {
    const el = document.createElement('span');
    el.className = `verdict ${scored ? 'is-scored' : 'is-miss'}`;
    el.textContent = text;
    if (detail) {
      const small = document.createElement('small');
      small.textContent = detail;
      el.appendChild(small);
    }
    el.style.left = `${Math.min(72, Math.max(28, xPct))}%`;
    el.style.top = `${Math.min(80, Math.max(24, yPct))}%`;
    this.barks.appendChild(el);
    window.setTimeout(() => el.remove(), 1300);
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

  clearOverlays(): void {
    this.banner.className = 'banner';
    this.banner.textContent = '';
    this.announceEl.classList.remove('is-on');
    this.yellEl.classList.remove('is-on');
    this.barks.innerHTML = '';
  }

  bark(text: string, xPct: number, yPct: number, who: 'chuck' | 'boxer' | 'jeanmi'): void {
    const el = document.createElement('span');
    el.className = `bark bark-${who}`;
    el.textContent = text;
    el.style.left = `${xPct}%`;
    el.style.top = `${yPct}%`;
    this.barks.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    window.setTimeout(() => el.remove(), 2000);
  }

  // ------------------------------------------------------------ écran de lancement
  renderTitle(save: OliveSave): void {
    const rows: [string, string][] = [
      ['MEILLEUR SCORE', fr(save.best)],
      ['VICTOIRES', fr(save.wins)],
      ['OLIVES DANS LE VERRE', fr(save.olives)],
      ['GUERRES AVEC JEAN-MI', fr(save.diplomatic)],
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
    const [first, ...rest] = r.lines;
    this.resultMessage.textContent = `« ${first} »`;
    this.resultSub.innerHTML = '';
    for (const line of rest) {
      const span = document.createElement('span');
      span.textContent = `« ${line} »`;
      this.resultSub.appendChild(span);
      this.resultSub.appendChild(document.createElement('br'));
    }
    this.app.dataset.outcome = r.kind;
    this.resultScore.textContent = `${fr(r.score)} PTS`;
    this.resultRecord.hidden = !r.record;

    const time = `${r.elapsed.toFixed(1).replace('.', ',')} S`;
    this.resultDetail.textContent = [
      `OLIVES ${r.scored}/${STORM.target}`,
      `TIRS UTILISÉS ${r.used}/${STORM.shots}`,
      `PRÉCISION ${Math.round(r.accuracy * 100)} %`,
      `TEMPS ${time}`,
      `MEILLEUR SCORE ${fr(r.best)}`,
    ].join(' · ');

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

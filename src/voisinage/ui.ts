import { DUEL, type Act, type Ending, type WatchState } from './config/balance';
import { ACTS, HOLD_LABEL, WATCH_LABEL } from './config/messages';
import { MEDALS, type Medal } from './systems/medals';
import type { ScoreLine } from './systems/score';
import type { VoisinSave } from './save';
import type { Caption } from './scenes/GardenScene';

export type Screen = 'loading' | 'title' | 'intro' | 'play' | 'result';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error('#' + id + ' introuvable');
  return el as T;
};

const fr = (n: number) => n.toLocaleString('fr-FR');

export interface ResultView {
  kind: Ending;
  perfect: boolean;
  lines: string[];
  score: number;
  detail: ScoreLine[];
  best: number;
  record: boolean;
  rage: number;
  strikes: number;
  newMedals: Medal[];
}

/** Interface HTML de MAURIIIIICE !!! : mêmes composants et classes CSS que les autres missions. */
export class VoisinUI {
  readonly app = $<HTMLDivElement>('app');
  readonly stage = $<HTMLDivElement>('stage');
  readonly startBtn = $<HTMLButtonElement>('start');
  readonly holdBtn = $<HTMLButtonElement>('hold');
  readonly retryBtn = $<HTMLButtonElement>('retry');
  readonly shareBtn = $<HTMLButtonElement>('share');
  readonly menuBtn = $<HTMLButtonElement>('menu');
  readonly muteBtn = $<HTMLButtonElement>('mute');
  readonly calmBtn = $<HTMLButtonElement>('calm');

  private loading = $('loading');
  private intro = $('intro');
  private go = $('go');
  private timer = $('timer');
  private timerValue = $('timer-value');
  private actTag = $('act-tag');
  private strikes = $('strikes');
  private strikeCount = $('strike-count');
  private rage = $('rage');
  private rageFill = $('rage-fill');
  private ragePct = $('rage-pct');
  private watch = $('watch');
  private holdVerb = $('hold-verb');
  private holdLabel = $('hold-label');
  private announceEl = $('announce');
  private card = $('card');
  private sub = $('sub');
  private shout = $('shout');
  private barks = $('barks');
  private black = $('black');
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
  private lastPct = -1;

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

  setLoading(text: string, error = false): void {
    this.loading.textContent = text;
    this.loading.classList.toggle('is-error', error);
  }

  setMuted(muted: boolean): void {
    this.muteBtn.setAttribute('aria-pressed', String(muted));
    this.muteBtn.classList.toggle('is-muted', muted);
    this.muteBtn.setAttribute('aria-label', muted ? 'Activer le son' : 'Couper le son');
  }

  /** Option de confort : secousses et flashs réduits. */
  setCalm(calm: boolean): void {
    this.calmBtn.setAttribute('aria-pressed', String(calm));
    this.calmBtn.classList.toggle('is-muted', calm);
    this.calmBtn.setAttribute('aria-label', calm ? 'Rétablir les secousses et les flashs' : 'Réduire les secousses et les flashs');
    if (calm) this.app.dataset.calm = '1';
    else delete this.app.dataset.calm;
  }

  // ------------------------------------------------------------ HUD
  updateTimer(timeLeft: number): void {
    const sec = Math.ceil(timeLeft);
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    this.timerValue.textContent = String(sec).padStart(2, '0');
    this.timer.classList.toggle('is-urgent', sec <= 5);
  }

  updateRage(rage: number): void {
    const pct = Math.floor(rage);
    this.rageFill.style.width = rage + '%';
    if (pct === this.lastPct) return;
    this.lastPct = pct;
    this.ragePct.textContent = pct + ' %';
    this.rage.setAttribute('aria-valuenow', String(pct));
    this.rage.classList.toggle('is-critical', rage >= DUEL.alertAt);
  }

  updateStrikes(n: number, bump = false): void {
    this.strikeCount.textContent = String(n);
    this.strikes.classList.toggle('is-danger', n >= DUEL.maxStrikes - 1);
    if (!bump) return;
    this.strikes.classList.remove('is-bump');
    void this.strikes.offsetWidth;
    this.strikes.classList.add('is-bump');
  }

  setAct(act: Act): void {
    this.app.dataset.act = String(act);
    this.actTag.textContent = 'ACTE ' + act;
    this.holdVerb.textContent = ACTS[act].verb;
    this.holdLabel.textContent = HOLD_LABEL;
  }

  setWatch(state: WatchState): void {
    this.app.dataset.watch = state;
    this.watch.textContent = WATCH_LABEL[state];
  }

  setHeld(held: boolean): void {
    this.holdBtn.classList.toggle('is-down', held);
  }

  announce(text: string): void {
    this.announceEl.textContent = text;
    this.restart(this.announceEl);
  }

  private restart(el: HTMLElement): void {
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
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
    this.restart(this.go);
  }

  // ------------------------------------------------------------ textes de scène
  private float(className: string, text: string, x: number, y: number, ms: number): HTMLElement {
    const el = document.createElement('span');
    el.className = className;
    el.textContent = text;
    el.style.left = x + '%';
    el.style.top = y + '%';
    this.barks.appendChild(el);
    if (ms > 0) window.setTimeout(() => el.remove(), ms);
    return el;
  }

  /** Petite bulle qui s'envole (réactions pendant le jeu). */
  bark(text: string, x: number, y: number, who: 'chuck' | 'jeanmi'): void {
    const el = this.float('bark bark-' + who, text, x, y, 1500);
    el.addEventListener('animationend', () => el.remove());
  }

  private lines(el: HTMLElement, lines: readonly string[]): void {
    el.innerHTML = '';
    for (const line of lines) {
      const p = document.createElement('p');
      p.textContent = line;
      el.appendChild(p);
    }
  }

  /** Textes des cinématiques, demandés par la scène. */
  caption(c: Caption): void {
    switch (c.kind) {
      case 'clear':
        this.clearCaptions();
        break;
      case 'shout': {
        // lettres rétro géantes, une par une, chacune avec son propre tremblement
        const rows = c.lines ?? [c.text ?? ''];
        this.shout.innerHTML = '';
        // la taille s'adapte à la ligne la plus longue
        this.shout.style.setProperty('--n', String(Math.max(...rows.map((r) => r.length))));
        let i = 0;
        for (const row of rows) {
          const line = document.createElement('div');
          for (const ch of row) {
            const span = document.createElement('span');
            span.textContent = ch === ' ' ? String.fromCharCode(160) : ch;
            span.style.animationDelay = -((i * 37) % 100) + 'ms, ' + i * 18 + 'ms';
            line.appendChild(span);
            i++;
          }
          this.shout.appendChild(line);
        }
        this.restart(this.shout);
        break;
      }
      case 'onoma':
        this.float('onoma', c.text ?? '', c.x ?? 50, c.y ?? 30, c.ms ?? 900);
        break;
      case 'bubble':
        this.float('bubble bubble-' + (c.who ?? 'chuck'), c.text ?? '', c.x ?? 50, c.y ?? 20, c.ms ?? 1200);
        break;
      case 'zzz':
        this.float('zzz', 'Z z z', c.x ?? 50, c.y ?? 30, 0);
        break;
      case 'title':
        this.lines(this.card, c.lines ?? []);
        this.restart(this.card);
        break;
      case 'sub':
        this.sub.textContent = c.text ?? '';
        this.restart(this.sub);
        break;
      case 'black':
        this.lines(this.black, c.lines ?? []);
        this.black.classList.add('is-on');
        break;
    }
  }

  private clearCaptions(): void {
    this.shout.classList.remove('is-on');
    this.shout.innerHTML = '';
    this.card.classList.remove('is-on');
    this.card.innerHTML = '';
    this.sub.classList.remove('is-on');
    this.sub.textContent = '';
    this.barks.innerHTML = '';
  }

  clearOverlays(): void {
    this.clearCaptions();
    this.announceEl.classList.remove('is-on');
    this.black.classList.remove('is-on');
    this.black.innerHTML = '';
  }

  // ------------------------------------------------------------ écran de lancement
  renderTitle(save: VoisinSave): void {
    const rows: [string, string][] = [
      ['MEILLEUR SCORE', fr(save.best)],
      ['SHORTS DÉCHIRÉS', fr(save.wins)],
      ['VICTOIRES PARFAITES', fr(save.cleanWins)],
      ['FLAGRANTS DÉLITS', fr(save.strikes)],
    ];
    this.stats.innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');

    this.medalCount.textContent = save.medals.length + '/' + MEDALS.length;
    this.medals.innerHTML = '';
    for (const m of MEDALS) {
      const has = save.medals.includes(m.id);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'medal' + (has ? ' is-earned' : '');
      b.textContent = has ? '★' : '?';
      b.setAttribute('aria-label', (has ? 'Médaille obtenue' : 'Médaille verrouillée') + ' : ' + m.name + '. ' + m.desc);
      const show = () => {
        this.medalInfo.textContent = (has ? '' : '[VERROUILLÉE] ') + m.name + ' — ' + m.desc;
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
    this.resultMessage.textContent = '« ' + first + ' »';
    this.resultSub.innerHTML = '';
    for (const line of rest) {
      const span = document.createElement('span');
      span.textContent = line;
      this.resultSub.appendChild(span);
      this.resultSub.appendChild(document.createElement('br'));
    }
    this.app.dataset.outcome = r.kind;
    this.resultScore.textContent = fr(r.score) + ' PTS';
    this.resultRecord.hidden = !r.record;
    this.resultDetail.textContent = [
      ...r.detail.map((l) => l.label + ' +' + fr(l.points)),
      'FLAGRANTS DÉLITS ' + r.strikes + '/' + DUEL.maxStrikes,
      'MEILLEUR SCORE ' + fr(r.best),
    ].join(' · ');

    this.newMedals.innerHTML = '';
    for (const m of r.newMedals) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="medal is-earned" aria-hidden="true">★</span><span><b></b><i></i></span>';
      li.querySelector('b')!.textContent = 'MÉDAILLE : ' + m.name;
      li.querySelector('i')!.textContent = m.desc;
      this.newMedals.appendChild(li);
    }
    this.shareBtn.textContent = 'PARTAGER';
  }
}

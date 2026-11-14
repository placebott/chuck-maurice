/**
 * La seule commande du jeu : maintenir / relâcher.
 * HoldState est la logique pure (testée) ; bindHold la branche sur le DOM.
 */
export class HoldState {
  /** Prévenu à chaque changement de l'état « maintenu ». */
  onChange?: (held: boolean) => void;
  private last = false;
  private readonly down = new Set<string>();
  /** Appuis antérieurs à une réinitialisation : ils ne comptent plus tant qu'ils ne sont pas relâchés. */
  private readonly stale = new Set<string>();

  get held(): boolean {
    for (const id of this.down) if (!this.stale.has(id)) return true;
    return false;
  }

  private sync(): void {
    const now = this.held;
    if (now === this.last) return;
    this.last = now;
    this.onChange?.(now);
  }

  press(id: string): void {
    this.stale.delete(id);
    this.down.add(id);
    this.sync();
  }

  release(id: string): void {
    this.down.delete(id);
    this.stale.delete(id);
    this.sync();
  }

  /** Changement d'état du jeu : un bouton resté enfoncé devra être relâché puis rappuyé. */
  reset(): void {
    for (const id of this.down) this.stale.add(id);
    this.sync();
  }

  /** Perte de focus, onglet masqué, toucher interrompu : tout est relâché. */
  releaseAll(): void {
    this.down.clear();
    this.stale.clear();
    this.sync();
  }
}

export interface HoldBinding {
  /** Zones où l'on peut maintenir : le gros bouton et la scène. */
  zones: HTMLElement[];
  /** Le maintien n'est écouté que pendant le jeu. */
  enabled: () => boolean;
  /** Premier appui : l'occasion de débloquer l'audio. */
  onPress?: () => void;
}

export function bindHold(state: HoldState, b: HoldBinding): void {
  for (const zone of b.zones) {
    // les autres boutons posés sur la scène (son, confort) gardent leur rôle
    const foreign = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('button');
      return btn !== null && btn !== zone;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (foreign(e) || !b.enabled()) return;
      e.preventDefault();
      b.onPress?.();
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* pointeur synthétique ou déjà relâché */
      }
      state.press(`p${e.pointerId}`);
    });
    const up = (e: PointerEvent) => state.release(`p${e.pointerId}`);
    zone.addEventListener('pointerup', up);
    zone.addEventListener('pointercancel', up);
    zone.addEventListener('lostpointercapture', up);
    // pas de défilement ni de menu contextuel pendant le maintien, dans la zone de jeu seulement
    zone.addEventListener('touchstart', (e) => {
      if (b.enabled() && !foreign(e) && e.cancelable) e.preventDefault();
    }, { passive: false });
    zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!b.enabled()) return;
    e.preventDefault();
    if (e.repeat) return;
    b.onPress?.();
    state.press('space');
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    state.release('space');
  });

  const drop = () => state.releaseAll();
  window.addEventListener('blur', drop);
  window.addEventListener('pagehide', drop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) drop();
  });
}

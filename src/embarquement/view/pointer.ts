/**
 * Souris et tactile, via les Pointer Events du navigateur. Un seul doigt
 * (ou bouton) à la fois ; le pointeur est capturé pendant un glisser, donc
 * la pièce suit même hors du canevas et le lâcher n'est jamais perdu.
 */

export interface PointerHandlers {
  /** Appui ; renvoie true si un glisser commence. Coordonnées en pixels du canevas. */
  down(x: number, y: number): boolean;
  move(x: number, y: number): void;
  up(): void;
  /** Survol sans appui : y a-t-il quelque chose à saisir ici ? (curseur de la souris) */
  canGrab(x: number, y: number): boolean;
}

export function bindPointer(canvas: HTMLCanvasElement, handlers: PointerHandlers): void {
  let active: number | null = null;

  const toCanvas = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const finish = (e: PointerEvent) => {
    if (e.pointerId !== active) return;
    active = null;
    canvas.style.cursor = '';
    handlers.up();
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (active !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = toCanvas(e);
    if (!handlers.down(p.x, p.y)) return;
    e.preventDefault();
    active = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointeur déjà relâché entre-temps : le pointerup suivant terminera le geste
    }
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toCanvas(e);
    if (e.pointerId === active) handlers.move(p.x, p.y);
    else if (active === null && e.pointerType === 'mouse') canvas.style.cursor = handlers.canGrab(p.x, p.y) ? 'grab' : '';
  });

  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('lostpointercapture', finish);
  // pas de menu contextuel ni de sélection sur un appui long
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

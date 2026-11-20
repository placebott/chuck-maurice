/**
 * Le QG (index.html) remplace l'ancien écran-titre des missions :
 * depuis le QG on entre directement en mission, et « MENU » / Échap y ramènent.
 */
export const HUB_URL = './';

export function goHub(): void {
  location.href = HUB_URL;
}

/**
 * La mission démarre sans clic sur sa propre page : le navigateur garde donc l'audio
 * suspendu jusqu'au premier geste. On le débloque à chaque geste, sans rien jouer.
 */
export function unlockAudioOnGesture(unlock: () => void): void {
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
}

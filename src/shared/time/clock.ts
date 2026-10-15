/**
 * Horloge serveur unique des règles d'abonnement. Les tests la remplacent pour vérifier
 * les bornes exactes (47 h 59 min 59 s, 48 h, 48 h + 1 ms) sans attendre.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

let current: Clock = systemClock;

export const clock: Clock = { now: () => current.now() };

export function setClock(next: Clock): void {
  current = next;
}

export function resetClock(): void {
  current = systemClock;
}

/** Horloge figée et déplaçable, pour les tests. */
export class ManualClock implements Clock {
  private value: number;

  constructor(start: Date | number) {
    this.value = typeof start === 'number' ? start : start.getTime();
  }

  now(): Date {
    return new Date(this.value);
  }

  set(at: Date | number): void {
    this.value = typeof at === 'number' ? at : at.getTime();
  }

  advance(ms: number): void {
    this.value += ms;
  }
}

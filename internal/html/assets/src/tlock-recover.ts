// tlock-recover.ts — Time-lock decryption for drand's League of Entropy.
// Used by recover.html for time-locked bundle recovery. Bundled as IIFE, exposes window.rememoryTlock.

import { timelockDecrypt } from 'tlock-js';
import { roundTime } from 'drand-client';
import { createClient } from './drand';
import type { TlockContainerMeta, TranslationFunction } from './types';

// Decrypt tlock ciphertext by fetching the beacon
async function decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
  const client = await createClient();
  const armored = new TextDecoder().decode(ciphertext);
  const decrypted = await timelockDecrypt(armored, client);
  return new Uint8Array(decrypted);
}

// Check if a round's beacon is available (time has passed)
async function isRoundAvailable(roundNumber: number): Promise<boolean> {
  try {
    const client = await createClient();
    const info = await client.chain().info();
    const rt = roundTime(info, roundNumber);
    return rt <= Date.now();
  } catch {
    return false;
  }
}

// Format a tlock unlock date for display. Shows time if within 24 hours, date-only otherwise.
function formatTimelockDate(date: Date): string {
  const hoursUntil = (date.getTime() - Date.now()) / 3600000;
  return (hoursUntil > 0 && hoursUntil < 24)
    ? date.toLocaleString()
    : date.toLocaleDateString();
}

// Format an unlock date for the waiting UI, with relative time for near-future dates.
function formatUnlockDate(date: Date, t: TranslationFunction): { text: string; relative: boolean } {
  const minutesUntil = (date.getTime() - Date.now()) / 60000;
  if (minutesUntil > 0 && minutesUntil < 60) {
    const m = Math.ceil(minutesUntil);
    return { text: t(m === 1 ? 'tlock_in_one_minute' : 'tlock_in_minutes', m), relative: true };
  }
  return { text: formatTimelockDate(date), relative: false };
}

// Internal timer state for waitAndDecrypt polling
let tlockTimer: ReturnType<typeof setInterval> | null = null;
let pendingCiphertext: Uint8Array | null = null;
let pendingMeta: TlockContainerMeta | null = null;

// Wait for the tlock unlock time to pass, then decrypt.
// onTick is called every 5 seconds with the current unlock date (for UI updates).
// onReady is called with the decrypted archive once the time lock passes.
// onError is called if decryption fails.
function waitAndDecrypt(
  meta: TlockContainerMeta,
  ciphertext: Uint8Array,
  onTick: (unlockDate: Date) => void,
  onReady: (archive: Uint8Array) => void,
  onError: (err: Error) => void
): void {
  pendingCiphertext = ciphertext;
  pendingMeta = meta;

  async function check(): Promise<void> {
    if (!pendingMeta || !pendingCiphertext) return;

    const unlockDate = new Date(pendingMeta.unlock);
    if (unlockDate > new Date()) {
      // Still waiting — update the display
      onTick(unlockDate);
      return;
    }

    // Time passed — decrypt
    const ct = pendingCiphertext;
    stopWaiting();
    try {
      const archive = await decrypt(ct);
      onReady(archive);
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  // Check immediately, then every 5 seconds
  check();
  if (!tlockTimer) {
    tlockTimer = setInterval(() => check(), 5000);
  }
}

// Stop the internal polling timer.
function stopWaiting(): void {
  if (tlockTimer) {
    clearInterval(tlockTimer);
    tlockTimer = null;
  }
  pendingCiphertext = null;
  pendingMeta = null;
}

// Expose on window for IIFE bundle
const api = {
  decrypt,
  isRoundAvailable,
  formatTimelockDate,
  formatUnlockDate,
  waitAndDecrypt,
  stopWaiting,
};

(window as any).rememoryTlock = api;

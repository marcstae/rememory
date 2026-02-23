// tlock-create.ts — Time-lock encryption for drand's League of Entropy.
// Used by maker.html for bundle creation. Bundled as IIFE, exposes window.rememoryTlock.

import { timelockEncrypt, Buffer } from 'tlock-js';
import { createClient, QUICKNET_GENESIS, QUICKNET_PERIOD } from './drand';

// Encrypt plaintext for a specific round number
async function encrypt(plaintext: Uint8Array, roundNumber: number): Promise<Uint8Array> {
  const client = await createClient();
  const payload = Buffer.from(plaintext);
  const armored = await timelockEncrypt(roundNumber, payload, client);
  return new TextEncoder().encode(armored);
}

// Compute the round number for a target date
function roundForTime(target: Date): number {
  const elapsed = (target.getTime() / 1000) - QUICKNET_GENESIS;
  if (elapsed <= 0) return 1;
  return Math.ceil(elapsed / QUICKNET_PERIOD) + 1;
}

// Compute the time at which a round will be emitted
function timeForRound(round: number): Date {
  if (round <= 1) return new Date(QUICKNET_GENESIS * 1000);
  const timestamp = QUICKNET_GENESIS + (round - 1) * QUICKNET_PERIOD;
  return new Date(timestamp * 1000);
}

// Encrypt plaintext for a target date, returning everything the caller needs.
async function encryptForDate(plaintext: Uint8Array, targetDate: Date): Promise<{
  ciphertext: Uint8Array;
  round: number;
  unlockDate: Date;
}> {
  const tlock = (window as any).rememoryTlock;
  const round = tlock.roundForTime(targetDate);
  const ciphertext = await encrypt(plaintext, round);
  const unlockDate = tlock.timeForRound(round);
  return { ciphertext, round, unlockDate };
}

// Compute a future date from a duration value and unit (e.g. 5, 'min' → 5 minutes from now).
function computeTimelockDate(value: number, unit: string): Date | null {
  if (value <= 0) return null;
  const now = new Date();
  switch (unit) {
    case 'min': return new Date(now.getTime() + value * 60000);
    case 'h': return new Date(now.getTime() + value * 3600000);
    case 'd': return new Date(now.getTime() + value * 86400000);
    case 'w': return new Date(now.getTime() + value * 7 * 86400000);
    case 'm': { const d = new Date(now); d.setMonth(d.getMonth() + value); return d; }
    case 'y': { const d = new Date(now); d.setFullYear(d.getFullYear() + value); return d; }
    default: return null;
  }
}

// Format a tlock unlock date for display. Shows time if within 24 hours, date-only otherwise.
function formatTimelockDate(date: Date): string {
  const hoursUntil = (date.getTime() - Date.now()) / 3600000;
  return (hoursUntil > 0 && hoursUntil < 24)
    ? date.toLocaleString()
    : date.toLocaleDateString();
}

// Expose on window for IIFE bundle
const api = {
  encrypt,
  encryptForDate,
  computeTimelockDate,
  formatTimelockDate,
  roundForTime,
  timeForRound,
};

(window as any).rememoryTlock = api;

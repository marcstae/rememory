// drand.ts — Drand quicknet chain parameters and client setup.
// All values come from Go via window.DRAND_CONFIG, injected at HTML generation time.
// The single source of truth is internal/core/tlock_common.go.

import { HttpCachingChain, HttpChainClient } from 'drand-client';
import type { ChainClient, ChainOptions } from 'drand-client';

interface DrandConfig {
  chainHash: string;
  genesis: number;
  period: number;
  publicKey: string;
  endpoints: string[];
}

const cfg = (window as any).DRAND_CONFIG as DrandConfig;
if (!cfg) {
  throw new Error('DRAND_CONFIG not found — drand configuration was not injected');
}

export const QUICKNET_CHAIN_HASH = cfg.chainHash;
export const QUICKNET_GENESIS = cfg.genesis;
export const QUICKNET_PERIOD = cfg.period;

// Create a drand chain client, trying endpoints in order.
export async function createClient(): Promise<ChainClient> {
  const options: ChainOptions = {
    disableBeaconVerification: false,
    noCache: false,
    chainVerificationParams: {
      chainHash: cfg.chainHash,
      publicKey: cfg.publicKey,
    },
  };

  let lastError: Error | undefined;
  for (const endpoint of cfg.endpoints) {
    try {
      const url = `${endpoint}/${cfg.chainHash}`;
      const chain = new HttpCachingChain(url, options);
      const client = new HttpChainClient(chain, options);
      await chain.info();
      return client;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw new Error(`Could not connect to drand: ${lastError?.message ?? 'all endpoints failed'}`);
}

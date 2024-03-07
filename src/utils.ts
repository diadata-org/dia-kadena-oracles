import { array, extendType, number, string } from 'cmd-ts';
import type { BuiltInPredicate, ChainId as KadenaChainId } from '@kadena/client';

export const panic = (msg?: unknown, ...params: unknown[]) => {
  console.error(msg, ...params);
  process.exit(1);
};

export const ChainId = extendType(number, {
  defaultValue: () => '0',
  from: async (n) => {
    if (Number.isNaN(n) || !Number.isFinite(n) || Math.round(n) !== n || n < 0 || n > 19) {
      throw new Error(`Input is not a valid chain id`);
    }
    return n.toString() as KadenaChainId;
  },
});

export const MessageData = extendType(array(string), {
  displayName: 'list',
  defaultValue: () => ({}),
  from: async (entries) => {
    const message: Record<string, unknown> = {};

    for (const str of entries) {
      const [key, value] = str.split('=');
      if (!key || !value) {
        throw new Error('Invalid message data');
      }

      try {
        message[key] = JSON.parse(value);
      } catch {
        message[key] = value;
      }
    }

    return message;
  },
});

export type Keyset = {
  pred: BuiltInPredicate;
  keys: string[];
};

export const Keysets = extendType(array(string), {
  displayName: 'list',
  defaultValue: () => ({}),
  from: async (entries) => {
    const keysets: Record<string, Keyset> = {};

    for (const str of entries) {
      const [key, data] = str.split('=');
      if (!key || !data) {
        throw new Error('Invalid message data');
      }

      const [pred, ...keys] = data.split(',');

      if (pred !== 'keys-all' && pred !== 'keys-any' && pred !== 'keys-2') {
        throw new Error(`Incorrect keyset predicate: ${pred}`);
      }
      if (!keys.length) {
        throw new Error('No public keys present');
      }

      keysets[key] = { pred: pred as BuiltInPredicate, keys };
    }

    return keysets;
  },
});

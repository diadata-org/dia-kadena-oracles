import fs from 'fs';
import { command, extendType, flag, number, option, optional, positional, string } from 'cmd-ts';
import { File } from 'cmd-ts/batteries/fs';

import {
  ChainId,
  createClient,
  createSignWithKeypair,
  createTransaction,
  getHostUrl,
} from '@kadena/client';
import {
  addData,
  addKeyset,
  addSigner,
  composePactCommand,
  execution,
  setMeta,
  setNetworkId,
} from '@kadena/client/fp';
import { asyncPipe, dirtyReadClient } from '@kadena/client-utils/core';
import { getBalance } from '@kadena/client-utils/coin';
import { genKeyPair } from '@kadena/cryptography-utils';

import { estimateGas, extractResult, logTransaction, safeSign } from './utils';

const DEFAULT_HOST = 'https://api.testnet.chainweb.com';

const ChainId = extendType(number, async (n) => {
  if (Number.isNaN(n) || !Number.isFinite(n) || Math.round(n) !== n || n < 0 || n > 19) {
    throw new Error(`Input is not a valid chain id`);
  }
  return n.toString() as ChainId;
});

const networkArgs = {
  host: option({
    long: 'host',
    env: 'API_HOST',
    description: `chainweb api host (default: ${DEFAULT_HOST})`,
    type: { ...string, defaultValue: () => DEFAULT_HOST },
  }),
  chainId: option({
    long: 'chain',
    env: 'CHAIN_ID',
    description: 'kadena chain id (default: 0)',
    type: { ...ChainId, defaultValue: () => '0' },
  }),
  networkId: option({
    long: 'network',
    env: 'NETWORK_ID',
    description: 'kadena network (default: testnet04)',
    type: { ...string, defaultValue: () => 'testnet04' },
  }),
};

const accountArgs = {
  publicKey: option({
    long: 'public-key',
    short: 'pk',
    description: 'deployer public key',
    env: 'PUBLIC_KEY',
  }),
  secretKey: option({
    long: 'secret-key',
    short: 'sk',
    description: 'deployer secret key (recommended to use env variable for safety)',
    env: 'SECRET_KEY',
  }),
  account: option({
    long: 'account',
    short: 'n',
    description: 'deployer account name (default: k:<public-key>)',
    type: optional(string),
  }),
};

export const deploy = command({
  name: 'deploy',
  description: 'deploy or upgrade a pact smart contract',
  args: {
    file: positional({
      displayName: 'module',
      description: 'Pact module file to deploy (.pact)',
      type: File,
    }),
    upgrade: flag({
      long: 'upgrade',
      short: 'u',
      description: 'upgrade an existing contract (default: false)',
    }),
    ...accountArgs,
    ...networkArgs,
  },
  handler: async ({ file, host, chainId, networkId, upgrade, ...keypair }) => {
    const senderAccount = keypair.account || `k:${keypair.publicKey}`;
    const src = await fs.promises.readFile(file, 'utf8');

    if (upgrade) {
      console.log('Upgrading an existing contract');
    }

    const command = composePactCommand(
      execution(src),
      addKeyset('admin-keyset', 'keys-all', keypair.publicKey),
      addData('upgrade', upgrade),
      addSigner(keypair.publicKey),
      setMeta({ chainId, gasLimit: 100_000, senderAccount }),
      setNetworkId(networkId),
    );

    const client = createClient(getHostUrl(host));
    const { gasLimit } = await estimateGas(command, client);

    const result = await asyncPipe(
      composePactCommand(setMeta({ gasLimit })),
      createTransaction,
      createSignWithKeypair(keypair),
      safeSign(createSignWithKeypair(keypair)),
      client.submitOne,
      logTransaction,
      client.listen,
      extractResult,
    )(command);

    console.log(`Successfully deployed ${file}:`);
    console.log(JSON.stringify(result, null, 2));
  },
});

export const genKeypair = command({
  name: 'gen-keypair',
  description: 'generate a new kadena public/secret key pair',
  args: {
    disableSave: flag({
      long: 'disable-save',
      description: 'do not save generated keys to .env (default: false)',
    }),
  },
  handler: async (args) => {
    const { publicKey, secretKey } = genKeyPair();

    console.log('\nSuccessfully generated a new keypair');
    console.log('Public key:', publicKey);
    console.log('Secret key:', secretKey);
    console.log('\nMake sure to save these keys as you will need to use them later.');

    if (!args.disableSave) {
      const env = `PUBLIC_KEY="${publicKey}"\nSECRET_KEY="${secretKey}"\n`;
      await fs.promises.writeFile('.env', env);
      console.log('Generated keypair has been saved in .env file.');
    }

    console.log('\nFollow this link to initialize and fund the account on testnet:');
    console.log('https://tools.kadena.io/faucet/new');
  },
});

export const read = command({
  name: 'read',
  description: 'execute a pact statement in read-only mode',
  args: {
    code: positional({
      displayName: 'code',
      description: 'pact statement to run',
    }),
    ...networkArgs,
  },
  handler: async ({ code, host, chainId, networkId }) => {
    const command = composePactCommand(
      execution(code),
      setMeta({ chainId }),
      setNetworkId(networkId),
    );

    const result = await dirtyReadClient({ host })(command).execute();
    console.log(JSON.stringify(result, null, 2));
  },
});

export const balance = command({
  name: 'balance',
  description: 'query kda balance of an account',
  args: {
    account: positional({
      displayName: 'account',
      description: 'kadena account name',
    }),
    ...networkArgs,
  },
  handler: async ({ account, host, chainId, networkId }) => {
    const balance = await getBalance(account, networkId, chainId, host);
    console.log(balance || '0');
  },
});

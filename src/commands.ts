import fs from 'fs';
import { command, flag, multioption, option, optional, positional, string } from 'cmd-ts';
import { File } from 'cmd-ts/batteries/fs';

import { createSignWithKeypair } from '@kadena/client';
import {
  addData,
  addKeyset,
  addSigner,
  composePactCommand,
  execution,
  setMeta,
  setNetworkId,
} from '@kadena/client/fp';
import { dirtyReadClient } from '@kadena/client-utils/core';
import { getBalance } from '@kadena/client-utils/coin';
import { genKeyPair } from '@kadena/cryptography-utils';

import { sendTransaction, setExecData } from './kadena';
import { ChainId, Keysets, MessageData } from './utils';

const DEFAULT_HOST = 'https://api.testnet.chainweb.com';

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
    type: ChainId,
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

const pactArgs = {
  code: positional({
    displayName: 'code',
    description: 'pact statement to run',
  }),
  data: multioption({
    long: 'data',
    short: 'd',
    description: 'raw message data in the format key=value',
    type: MessageData,
  }),
  keysets: multioption({
    long: 'keyset',
    short: 'k',
    description: 'transaction keyset in the format key=<pred>,<pk0>,<pk1>...',
    type: Keysets,
  }),
};

export const deploy = command({
  name: 'deploy',
  description: 'deploy or upgrade a pact smart contract',
  args: {
    file: positional({
      displayName: 'module',
      description: 'pact module file to deploy (.pact)',
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
      setMeta({ chainId, senderAccount }),
      setNetworkId(networkId),
    );

    const sign = createSignWithKeypair(keypair);
    const result = await sendTransaction(host, command, sign);

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
  args: { ...pactArgs, ...networkArgs },
  handler: async (args) => {
    const command = composePactCommand(
      execution(args.code),
      setExecData({ ...args.data, ...args.keysets }),
      setMeta({ chainId: args.chainId }),
      setNetworkId(args.networkId),
    );

    const read = dirtyReadClient({ host: args.host });
    const result = await read(command).execute();
    console.log(JSON.stringify(result, null, 2));
  },
});

export const write = command({
  name: 'write',
  description: 'execute a pact statement inside a transaction',
  args: {
    ...pactArgs,
    ...accountArgs,
    ...networkArgs,
  },
  handler: async (args) => {
    const { code, data, keysets, host, chainId, networkId, ...keypair } = args;
    const senderAccount = keypair.account || `k:${keypair.publicKey}`;

    const command = composePactCommand(
      execution(code),
      addSigner(keypair.publicKey),
      setExecData({ ...data, ...keysets }),
      setMeta({ chainId, senderAccount }),
      setNetworkId(networkId),
    );

    const sign = createSignWithKeypair(keypair);
    const result = await sendTransaction(host, command, sign);

    console.log('Successfully executed a transaction:');
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

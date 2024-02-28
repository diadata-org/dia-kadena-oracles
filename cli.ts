import {
  binary,
  command,
  extendType,
  flag,
  number,
  option,
  optional,
  positional,
  run,
  string,
  subcommands,
} from 'cmd-ts';
import { File } from 'cmd-ts/batteries/fs';
import dotenv from 'dotenv';
import fs from 'fs';
import {
  ChainId,
  ICommandResult,
  Pact,
  createClient,
  createSignWithKeypair,
  getHostUrl,
  isSignedTransaction,
} from '@kadena/client';
import { genKeyPair } from '@kadena/cryptography-utils';

dotenv.config();

const EXPLORER_URL = 'https://explorer.chainweb.com';

const ChainId = extendType(number, async (n) => {
  if (Number.isNaN(n) || !Number.isFinite(n) || Math.round(n) !== n || n < 0 || n > 19) {
    throw new Error(`Input is not a valid chain id`);
  }
  return n.toString() as ChainId;
});

const validateResult = (data: ICommandResult) => {
  if (data.result.status !== 'success') {
    console.error('Failed to execute the command:');
    console.error(JSON.stringify(data.result.error, null, 2));
    process.exit(1);
  }
  return data.result;
};

const estimateGas = () => {};

const networkArgs = {
  host: option({
    long: 'host',
    env: 'API_HOST',
    description: 'chainweb api host (default: https://api.testnet.chainweb.com)',
    type: { ...string, defaultValue: () => 'https://api.testnet.chainweb.com' },
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
  account: option({
    long: 'account',
    short: 'n',
    description: 'deployer account name (default: k:<public-key>)',
    type: optional(string),
  }),
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
};

const deploy = command({
  name: 'deploy',
  description: 'deploy or upgrade a pact smart contract',
  args: {
    ...networkArgs,
    ...accountArgs,
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
  },
  handler: async ({ file, host, chainId, networkId, upgrade, ...keypair }) => {
    const senderAccount = keypair.account || `k:${keypair.publicKey}`;
    const src = await fs.promises.readFile(file, 'utf8');

    const tx = Pact.builder
      .execution(src)
      .addData('upgrade', upgrade)
      .addKeyset('admin-keyset', 'keys-all', keypair.publicKey)
      .addSigner(keypair.publicKey)
      .setMeta({ chainId, gasLimit: 100_000, senderAccount })
      .setNetworkId(networkId)
      .createTransaction();

    const sign = createSignWithKeypair(keypair);
    const signedTx = await sign(tx);

    if (!isSignedTransaction(signedTx)) {
      console.error('Command is not signed');
      process.exit(1);
    }

    const { pollStatus, submitOne } = createClient(getHostUrl(host));

    if (upgrade) {
      console.log('Upgrading an existing contract');
    }

    const descr = await submitOne(signedTx);
    console.log('Request key:', descr.requestKey);

    if (networkId.startsWith('mainnet') || networkId.startsWith('testnet')) {
      const network = networkId.slice(0, -2);
      const url = `${EXPLORER_URL}/${network}/tx/${descr.requestKey}`;
      console.log('Explorer link:', url);
    }

    const response = await pollStatus(descr);
    const entry = response[descr.requestKey];
    if (!entry) {
      console.error('Invalid API response');
      process.exit(1);
    }

    validateResult(entry);
    console.log(`Successfully deployed ${file}:`);
    console.log(JSON.stringify(entry, null, 2));
  },
});

const genKeypair = command({
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

const read = command({
  name: 'read',
  description: 'execute a pact statement in read-only mode',
  args: {
    ...networkArgs,
    code: positional({
      displayName: 'code',
      description: 'pact statement to run',
    }),
  },
  handler: async ({ code, host, chainId, networkId }) => {
    const command = Pact.builder
      .execution(code)
      .setMeta({ chainId })
      .setNetworkId(networkId)
      .createTransaction();

    const { dirtyRead } = createClient(getHostUrl(host));
    const response = await dirtyRead(command);
    const result = validateResult(response);
    console.log(JSON.stringify(result.data, null, 2));
  },
});

const balance = command({
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
    const command = Pact.builder
      .execution(`(coin.get-balance "${account}")`)
      .setMeta({ chainId })
      .setNetworkId(networkId)
      .createTransaction();

    const { dirtyRead } = createClient(getHostUrl(host));
    const { result } = await dirtyRead(command);

    if (result.status !== 'success') {
      if (
        'message' in result.error &&
        typeof result.error.message === 'string' &&
        result.error.message.includes('row not found')
      ) {
        console.log('0.0');
        return;
      }

      console.error('Failed to query account balance:');
      console.error(JSON.stringify(result.error, null, 2));
      process.exit(1);
    }

    console.log(result.data.toString());
  },
});

const cmd = subcommands({
  name: 'dia-kadena-cli',
  version: '0.1.0',
  cmds: {
    deploy,
    'gen-keypair': genKeypair,
    balance,
    read,
  },
});

run(binary(cmd), process.argv).catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

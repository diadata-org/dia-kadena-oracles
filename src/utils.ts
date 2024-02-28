import { createClient, createTransaction, isSignedTransaction } from '@kadena/client';
import { composePactCommand } from '@kadena/client/fp';
import { asyncPipe } from '@kadena/client-utils/core';

import type {
  ICommand,
  ICommandResult,
  IPartialPactCommand,
  ITransactionDescriptor,
  IUnsignedCommand,
} from '@kadena/client';
import type { PactValue } from '@kadena/types';

export const panic = (msg?: unknown, ...params: unknown[]) => {
  console.error(msg, ...params);
  process.exit(1);
};

const EXPLORER_URL = 'https://explorer.chainweb.com';

export const logTransaction = (descriptor: ITransactionDescriptor) => {
  const { networkId, requestKey } = descriptor;
  console.log('Request key:', requestKey);

  if (networkId.startsWith('mainnet') || networkId.startsWith('testnet')) {
    const network = networkId.slice(0, -2);
    const url = `${EXPLORER_URL}/${network}/tx/${requestKey}`;
    console.log('Explorer link:', url);
  }
  return descriptor;
};

export const safeSign = (
  sign: (transaction: IUnsignedCommand) => Promise<IUnsignedCommand | ICommand>,
) => {
  return async (tx: IUnsignedCommand) => {
    if (tx.sigs.length === 0) return tx as ICommand;
    const signedTx = await sign(tx);

    const { sigs, hash } = signedTx;
    const txWithSigs = { ...tx, sigs };

    if (txWithSigs.hash !== hash) {
      throw new Error('Hash mismatch');
    }
    if (!isSignedTransaction(txWithSigs)) {
      throw new Error('Signing failed');
    }
    return txWithSigs;
  };
};

export const panicIfFails = (response: ICommandResult) => {
  if (response.result.status !== 'success') {
    return panic('Failed to execute the command:', JSON.stringify(response.result.error, null, 2));
  }
  return response;
};

export const extractResult = <T = PactValue>(response: ICommandResult) => {
  if (response.result.status !== 'success') {
    return panicIfFails(response);
  }
  return response.result.data as T;
};

export const estimateGas = (
  command:
    | IPartialPactCommand
    | ((cmd?: IPartialPactCommand | (() => IPartialPactCommand)) => IPartialPactCommand),
  client = createClient(),
) => {
  const pipeLine = asyncPipe(
    composePactCommand({
      meta: {
        gasLimit: 150_000,
        gasPrice: 1.0e-8,
      } as IPartialPactCommand['meta'],
    }),
    createTransaction,
    (tx) => client.local(tx, { preflight: true, signatureVerification: false }),
    panicIfFails,
    (response) => ({ gasLimit: response.gas, gasPrice: 1.0e-8 }),
  );
  return pipeLine(command);
};

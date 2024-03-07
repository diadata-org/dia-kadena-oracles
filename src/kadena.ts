import { createClient, createTransaction, getHostUrl, isSignedTransaction } from '@kadena/client';
import { addData, composePactCommand, setMeta } from '@kadena/client/fp';
import { asyncPipe } from '@kadena/client-utils/core';
import type {
  ICommand,
  ICommandResult,
  IPartialPactCommand,
  ISignFunction,
  ITransactionDescriptor,
  IUnsignedCommand,
} from '@kadena/client';
import type { PactValue } from '@kadena/types';

import { panic } from './utils';

const EXPLORER_URL = 'https://explorer.chainweb.com';

const logTransaction = (descriptor: ITransactionDescriptor) => {
  const { networkId, requestKey } = descriptor;
  console.log('Request key:', requestKey);

  if (networkId.startsWith('mainnet') || networkId.startsWith('testnet')) {
    const network = networkId.slice(0, -2);
    const url = `${EXPLORER_URL}/${network}/tx/${requestKey}`;
    console.log('Explorer link:', url);
  }
  return descriptor;
};

const safeSign = (
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

const panicIfFails = (response: ICommandResult) => {
  if (response.result.status !== 'success') {
    return panic('Failed to execute the command:', JSON.stringify(response.result.error, null, 2));
  }
  return response;
};

const extractResult = <T = PactValue>(response: ICommandResult) => {
  if (response.result.status !== 'success') {
    return panicIfFails(response);
  }
  return response.result.data as T;
};

export type ComposableCommand =
  | IPartialPactCommand
  | ((cmd?: IPartialPactCommand | (() => IPartialPactCommand)) => IPartialPactCommand);

const estimateGas = (command: ComposableCommand, client = createClient()) => {
  const pipeLine = asyncPipe(
    composePactCommand({
      meta: {
        gasLimit: 150_000,
        gasPrice: 1.0e-8,
      },
    }),
    createTransaction,
    (tx) => client.local(tx, { preflight: true, signatureVerification: false }),
    panicIfFails,
    (response) => ({ gasLimit: response.gas, gasPrice: 1.0e-8 }),
  );
  return pipeLine(command);
};

export const sendTransaction = async (
  host: string,
  command: ComposableCommand,
  sign: ISignFunction,
) => {
  const client = createClient(getHostUrl(host));
  const { gasLimit } = await estimateGas(command, client);

  return asyncPipe(
    composePactCommand(setMeta({ gasLimit })),
    createTransaction,
    safeSign(sign),
    client.submitOne,
    logTransaction,
    client.listen,
    extractResult,
  )(command);
};

export const setExecData = (data: Record<string, unknown>) =>
  composePactCommand({
    payload: {
      exec: { data },
    },
  });

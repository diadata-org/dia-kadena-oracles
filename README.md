# DIA Kadena oracles

This repository contains DIA oracle smart contracts for Kadena. At the moment, the following oracles are implemented:

- Key/value oracle with support for multiple updates in one transaction

## Requirements

- [Pact 4.10+](https://github.com/kadena-io/pact/releases)
- [Z3 4.x](https://github.com/Z3Prover/z3)
- [Node.js 20.x](https://nodejs.org)
- [Yarn](https://yarnpkg.com)

## Installing dependencies

This project uses Yarn to manage its packages. After installing all required global dependencies, you will need to run:

```sh
yarn install
yarn build
yarn global add "file:$PWD"
```

## Running tests

To execute all unit tests in Pact REPL:

```sh
yarn test

yarn coverage # to generate lcov report file
```

There is a GitHub workflow set up in this repository which runs unit tests on every push to the main branch and adds the coverage report as a comment to the corresponding commit.

## Deploying smart contracts

Unlike in other protocols, Kadena smart contracts are identified by their name instead of an address. This means you can't deploy multiple contracts with the same name on one chain. Possible solutions are:

- Deploying on a different chain (Kadena has 20 chains reserved for each network)
- Change the module name in code manually

> Note: at the moment of this writing, the `dia-oracle` smart contract is deployed on chains `0` and `2` of `testnet04` network. The `free` namespace was used for all deployments.

There's is a helper CLI we developed that allows you to interact with Kadena and deploy the oracle contracts. To use it (assuming all depencies are installed), run:

```sh
dia-kadena-cli --help
```

This will output a help message listing all available commands.
<br>
<br>
Example of deploying a `dia-oracle.pact` module to testnet:

```sh
# Generate a new keypair
# (follow the instructions provided by this command to prepare your account)
dia-kadena-cli gen-keypair

# Submit the deployment transaction (testnet04 is selected by default)
dia-kadena-cli deploy pact/dia-oracle.pact --chain 3

# Verify that the contract is ready for usage
dia-kadena-cli read '(describe-module "free.dia-oracle")' --chain 3
```

## Important notes

- Unlike EVM or WASM, Kadena contract are not compiled to bytecode before deploying. The full human-readable source code is uploaded to the network, which means there's no need to verify contracts on explorer.
- We highly recommend to create different admin accounts for every oracle smart contract you deploy. Kadena accounts have a nonce, therefore it's not possible to submit multiple commands in parallell. Doing so might cause issues at runtime.

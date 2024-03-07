#!/usr/bin/env node
import { binary, run, subcommands } from 'cmd-ts';
import dotenv from 'dotenv';
import * as commands from './commands';
import { panic } from './utils';

dotenv.config();

const { genKeypair, ...cmds } = commands;

const cmd = subcommands({
  name: 'dia-kadena-cli',
  version: '0.1.0',
  cmds: { ...cmds, 'gen-keypair': commands.genKeypair },
});

run(binary(cmd), process.argv).catch(panic);
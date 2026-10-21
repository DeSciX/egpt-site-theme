#!/usr/bin/env node
import { main } from '../src/page.mjs';
process.exitCode = await main(process.argv.slice(2));

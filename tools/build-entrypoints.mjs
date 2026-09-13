// One CJS runtime, a thin ESM entrypoint and declarations for both module systems.
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const sdk = require('../dist/index.js');
const metadata = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (sdk.VERSION !== metadata.version) throw Error('SDK and package versions differ.');
const names = Object.keys(sdk).filter(name => name !== 'default');
if (names.some(name => !/^[A-Za-z][A-Za-z0-9]*$/.test(name))) throw Error('Invalid public export.');
await writeFile(new URL('../dist/index.mjs', import.meta.url), '// Generated: ESM and CJS share class identity and connection state.\nimport sdk from "./index.js";\n' + names.map(name => `export const ${name} = sdk.${name};`).join('\n') + '\nexport default sdk.Client;\n');
await writeFile(new URL('../dist/index.d.mts', import.meta.url), 'export * from "./index.js";\nexport {Client as default} from "./index.js";\n');
console.log(`Built Wholly Crypto ${sdk.VERSION}: CommonJS, ESM and TypeScript declarations.`);

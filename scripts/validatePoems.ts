import { validatePoems } from '../engine/validatePoems.js';
const result = validatePoems(process.cwd());
for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
for (const error of result.errors) console.error(error);
if (result.errors.length) process.exitCode = 1;
else console.log('Poem validation passed (legacy warnings do not modify content).');

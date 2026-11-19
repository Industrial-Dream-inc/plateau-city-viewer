// List districts and price a crop. Free unless you pass --generate.
//
//   export BUNCHO_API_KEY=bk_live_...        # https://bun-cho.work/studio/developers
//   node examples/sdk-node.mjs                # list + estimate (free)
//   node examples/sdk-node.mjs --generate     # spends DREAM (300 per block)

import { BunChoCity } from '../src/sdk/buncho-city.js';

const api = new BunChoCity();
const area = { district: 'ginza', width_m: 400, depth_m: 300 };

const { districts } = await api.listLocations();
console.log(`${districts.length} districts:`, districts.map((d) => d.id).join(', '));

if (!api.apiKey) {
  console.log('\nSet BUNCHO_API_KEY to price and generate a crop.');
  process.exit(0);
}

const est = await api.estimate(area);
console.log('\nestimate:', est);

if (process.argv.includes('--generate')) {
  const out = await api.generate(area, { confirm: true });
  console.log('\nresult:', out);
} else {
  console.log('\nRun with --generate to build it (spends DREAM).');
}

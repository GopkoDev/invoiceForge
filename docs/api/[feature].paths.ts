import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// One page per docs/features/<feature>/contracts/openapi.yaml, served at /api/<feature>.
const featuresDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../features'
);

export function openapiFeatures() {
  return fs
    .readdirSync(featuresDir)
    .filter((feature) =>
      fs.existsSync(path.join(featuresDir, feature, 'contracts/openapi.yaml'))
    )
    .sort();
}

const loader = {
  watch: ['../features/*/contracts/openapi.yaml'],
  paths() {
    return openapiFeatures().map((feature) => {
      const file = path.join(featuresDir, feature, 'contracts/openapi.yaml');
      // A broken contract shows its parse error on its own page instead of failing the whole site.
      try {
        return {
          params: { feature, spec: parse(fs.readFileSync(file, 'utf8')) },
        };
      } catch (error) {
        return { params: { feature, error: String(error) } };
      }
    });
  },
};

export default loader;

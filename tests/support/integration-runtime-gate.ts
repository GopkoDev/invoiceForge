// Setup file for vitest.integration.config.ts (editor-ux T46, review Q6): with CI set and no
// container runtime every integration file fails here instead of skipping and exiting 0.
import {
  isContainerRuntimeAvailable,
  requireContainerRuntimeForIntegration,
} from './db/docker-availability';

requireContainerRuntimeForIntegration({
  ci: Boolean(process.env.CI),
  available: await isContainerRuntimeAvailable(),
});

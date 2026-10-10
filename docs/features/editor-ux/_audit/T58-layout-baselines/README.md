# Layout baseline review images (T58)

Old / new / diff images for the three layout baselines re-captured on purpose in T46 (commit fc03e39), so the owner can review them from the repo.
The owner's verdict is recorded in `../T53-linux-e2e-2026-10-10.log` ("Owner review"), not here.

- old = the baseline as first recorded from main's app in d40c9aa (`git show d40c9aa:tests/e2e/editor-layout.spec.ts-snapshots/<name>.png`)
- new = the baseline at HEAD 1050f70 (unchanged since fc03e39)
- diff = red where a pixel differs (pixelmatch colour distance, threshold 0.2, anti-aliasing not excluded), grey elsewhere. This is not Playwright's own comparator output, so the percentages differ from the T53 log's rounded figures by under 1 point.

| Baseline (tests/e2e/editor-layout.spec.ts-snapshots/) | Files here | Differing pixels |
| --- | --- | --- |
| editor-new-invoice-desktop-chromium-linux.png (1280x800) | `editor-new-invoice-desktop-chromium-linux.{old,new,diff}.png` | 35.78% |
| editor-new-invoice-phone-chromium-linux.png (390x844) | `editor-new-invoice-phone-chromium-linux.{old,new,diff}.png` | 10.00% |
| editor-existing-invoice-desktop-chromium-linux.png (1280x800) | `editor-existing-invoice-desktop-chromium-linux.{old,new,diff}.png` | 26.08% |

`editor-existing-invoice-phone-chromium-linux.png` was not re-taken; it is byte-identical to d40c9aa (0.00%), so it has no images here.
What the differences are (pre-filled sender and bank from T22, narrower preview mask from T46) is described in the T53 log, section "Layout baselines".
`percentages.txt` holds the exact counts.

Rebuild everything (from the repo root; uses the pngjs inside playwright-core, no install):

    node docs/features/editor-ux/_audit/T58-layout-baselines/build.mjs [oldRev=d40c9aa] [newRev=1050f70]

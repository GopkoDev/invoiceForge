# Layout baseline review images (T58)

Old / new / diff / exact-diff images for the four layout baselines, so the owner can review them from the repo. Three were re-captured on purpose in T46 (commit fc03e39); all four were re-taken again in T67 (commit 2a5df97) for the new cookie banner text. T71 rebuilt this folder against bd2278c; T73 (review r8) added the exact diffs.
The owner's verdict is recorded in `../T53-linux-e2e-2026-10-10.log` ("Owner review"), not here.

- old = the baseline as first recorded from main's app in d40c9aa (`git show d40c9aa:tests/e2e/editor-layout.spec.ts-snapshots/<name>.png`)
- new = the baseline at bd2278c (unchanged since 2a5df97); each `*.new.png` is byte-identical to the file in `tests/e2e/editor-layout.spec.ts-snapshots/`
- diff = red where a pixel differs (pixelmatch colour distance, threshold 0.2, anti-aliasing not excluded), grey elsewhere. This is not Playwright's own comparator output. The T53 log's figures describe the T46 re-capture; the T66 banner text and T67 re-capture came later, so the percentages here are larger (new-invoice phone: 11.09% here, 9% in the T53 log).
- exact-diff = the same, but red wherever any RGBA byte differs (no threshold). It shows changes too faint for the 0.2 threshold, such as the overlay scrollbar thumb on the existing-invoice phone image.

| Baseline (tests/e2e/editor-layout.spec.ts-snapshots/) | Files here | Differing pixels (threshold 0.2 / exact) |
| --- | --- | --- |
| editor-new-invoice-desktop-chromium-linux.png (1280x800) | `editor-new-invoice-desktop-chromium-linux.{old,new,diff,exact-diff}.png` | 35.81% / 49.85% |
| editor-new-invoice-phone-chromium-linux.png (390x844) | `editor-new-invoice-phone-chromium-linux.{old,new,diff,exact-diff}.png` | 11.09% / 32.63% |
| editor-existing-invoice-desktop-chromium-linux.png (1280x800) | `editor-existing-invoice-desktop-chromium-linux.{old,new,diff,exact-diff}.png` | 26.33% / 26.89% |
| editor-existing-invoice-phone-chromium-linux.png (390x844) | `editor-existing-invoice-phone-chromium-linux.{old,new,diff,exact-diff}.png` | 1.09% / 2.36% |

What the differences are (pre-filled sender and bank from T22, narrower preview mask from T46) is described in the T53 log, section "Layout baselines". On top of that, all four now show the shorter cookie banner text of T66 (T67 log); on the existing-invoice phone image the cookie banner (rows 737-843) and the vanished overlay scrollbar thumb at the right edge (x 382-388, rows 62-278) are the only differences. The thumb is too faint for the 0.2 threshold, so it is red only in the exact diff.
`percentages.txt` holds the exact counts.

Rebuild everything (from the repo root; uses the pngjs inside playwright-core, no install):

    node docs/features/editor-ux/_audit/T58-layout-baselines/build.mjs [oldRev=d40c9aa] [newRev=HEAD]

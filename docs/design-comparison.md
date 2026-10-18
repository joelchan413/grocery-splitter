# Design comparison

Branch: `design/receipt-ui-comparison`.

Use the comparison buttons above the app to switch without reloading. The choice is saved on this device. Direct links use `?design=anthropic` or `?design=taste`; switching preserves an existing `trip` query parameter.

## A. Market day

Design source: [Anthropic frontend-design](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design/SKILL.md). This is the only design skill used for this variant.

The concept comes from the grocery run itself: a market sign beside an example receipt, followed by a workspace for choosing the payer and uploading photos. The example uses the existing Trader Joe's sample items and calculates its total from those items, discounts, and tax. It is labeled as an example.

Tokens:

- Ground `#f1f5fb`, ink `#14264c`, cobalt `#2549ce`, receipt field `#e8ed9c`, paper `#ffffff`, secondary text `#52647f`.
- Bricolage Grotesque for headings and the wordmark; Geist for forms and body text.
- Broad, left-aligned composition, with the payer and upload controls beside each other on desktop. The phone layout stacks those controls and omits the decorative receipt preview.

```text
desktop                              phone
headline          example receipt    headline
upload action                        upload action
payer             receipt upload     payer
sample intro      sample actions     receipt upload
                                     sample actions
```

The initial plan included a caption over the receipt. Visual review found that it competed with the receipt total, so it was removed. The opening action opens the file picker directly, keeping an upload action on the first phone screen.

Implementation: `src/components/designs/AnthropicScanner.tsx` and `anthropic.css`.

## B. Quiet instrument

Design source: [Taste Skill v2](https://github.com/Leonxlnx/taste-skill/blob/f624f37a8c650b9cc550253104925efe4c8de246/skills/taste-skill/SKILL.md). This is the only design skill used for this variant. No Anthropic or Hallmark art direction was applied to it.

The skill's draw script offered Quiet instrument, Name as monument, and Loud and flat. Quiet instrument was selected because the app's exact item claims and tax shares suit a small working instrument. Seed: `1566957308`. No redraws. The complete dealt sheet is saved in [taste-direction.json](design-comparison/taste-direction.json).

The subject inventory was the existing household, payer, up to three receipt sections, personal item claims, shared unclaimed quantities, item taxability, basket discounts, live roommate readiness, receipt history, and Venmo balances.

Argument and proof:

- A grocery run has one payer: choose an actual household participant.
- The receipt becomes editable items: upload photos and review the scan.
- A split can be tried first: open the existing Trader Joe's or Costco sample.
- Personal items and tax stay with their claimants: continue through the existing claiming and settlement screens.

Idea: the app's item-by-item accounting becomes a quiet reading column. Its live interaction is the actual payer selection and receipt upload, followed by editable claims. The headline is “Split the grocery run.”

Tokens:

- Ground `#0a0a0a`, surface `#151515`, ink `#efefef`, secondary text `#b4b4b4`, crimson `#b11226`.
- EB Garamond, with regular text and restrained emphasis.
- A 560px column, offset to the left on desktop and centered on tablet. Flat surfaces replace outlines and resting shadows; phone controls use two columns.

```text
desktop                              phone
        headline                     headline
        payer                        payer
        receipt upload               receipt upload
        sample actions               sample actions
```

The skill explicitly targets public-facing pages, excluding app screens. The user's requested app comparison takes precedence. Its art direction, draw, copy rules, and source lint were used; marketing-only requirements for four photographs, video, long promotional sections, and eight entrance animations were not added to a receipt form. User avatars and the existing working trip controls retain their meaning. This is an app adaptation, not a claim of full marketing-page inspector compliance.

Visual review led to shorter introductory copy, less space before the form, and smaller phone payer rows, so the upload action appears sooner. No external photographs, stock assets, generated images, or invented endorsements were used. Fonts are self-hosted through Next.js.

Implementation: `src/components/designs/TasteScanner.tsx` and `taste.css`.

## Shared behavior and verification

`ReceiptScanner` owns upload, payer, loading, and error state. Each design receives the same functional controls. Switching changes presentation without remounting the scanner or the current review, claiming, or settlement screen. Sample receipts do not inherit an unrelated pending upload.

Neither variant changes the storage format, database, tax calculations, synchronization endpoints, or redeployment scripts. Design preference uses a separate browser-local key.

Checks performed:

- Production build and TypeScript validation.
- ESLint on the new scanner, design components, and comparison tests.
- Taste source lint on its component and stylesheet: zero failures and warnings. Explicit lint comments explain removals of inherited shadows and blur that the static scanner otherwise flags.
- Six Playwright checks across the desktop and mobile projects cover uploaded-photo and payer retention, scanning and download links, unsaved review edits, claims, settlement, preference persistence, two-line headlines, and overflow at 390, 768, and 1440 pixels. All API traffic in these tests is mocked.
- T3 browser inspection confirmed loaded fonts, distinct palettes, and responsive geometry. Its snapshot tool failed, so visual review used frames from T3 browser recordings instead. The skill's separate Chromium inspector was not run because this environment requires the collaborative T3 browser.

The Taste marketing rubric is a poor fit for an app form. A conservative adapted self-assessment is design 6.5, usability 8, creativity 6.5, content 8, or 7.1 weighted. The picture and motion floors of the unmodified marketing rubric are intentionally unmet. This score is subjective, not an automated result or an external review.

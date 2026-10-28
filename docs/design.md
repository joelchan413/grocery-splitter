# Design

GrocerySplit's interface follows one art direction, chosen from a four-way comparison in October 2026.

## Source

The direction comes from [Taste Skill v2.1.5](https://github.com/Leonxlnx/taste-skill/blob/12af471f627f866411b4bd785b19646d3672784c/skills/taste-skill/SKILL.md) and its app-screen run in `references/app-screens.md`.

- **Draw:** `draw.mjs --app --kind finance --screens home,list,detail`, style `pastel-consumer`, seed `694281605`, no redraws.
- **Sheet:** the dealt sheet is saved in [design/direction.json](design/direction.json).
- **Why this style:** roommates and their money are the product's objects, the app is checked quickly on a phone, and the style gives each person one stable pale hue.

The three rejected directions, Anthropic "Market day", Taste "Quiet instrument" and Anthropic "Unpacking day", remain in git history. Commit `6ed501d` and a local stash, "design comparison A-D", hold them.

## Tokens

Tokens live in `src/app/globals.css`, in Tailwind's `@theme`.

| Role | Value |
| --- | --- |
| Ground | `#f3f5f7` |
| Surface | `#ffffff` |
| Ink | `#1b1d1f` |
| Muted text | `#5c6064` |
| Primary action | `#1b1d1f`, near-black with white text |
| Accent | `#1d5fd6`, used on the mark, focus rings and the claiming pill only |
| Money in | `#2f7a45` |
| Radii | cards 20px, controls 10px, buttons fully round |
| Type | Manrope at 400, 500 and 600, tabular figures on every amount |

Tailwind's `slate` scale is re-tuned to these neutrals, so every text grey passes 4.5:1 on white. The `primary` scale replaces the old green.

## Roommates

Each roommate is an initial on a pale tint of their own saved colour, with the dark of that hue as ink. `src/components/Avatar.tsx` draws it. `src/lib/person.ts` falls back to a stable colour when none is saved. The tint mixes 16% of the colour into white, and the ink mixes 42% into black. That pair passes 4.5:1 for any colour a user can pick.

The default colours for new households and new roommates are blue, emerald, amber and pink. Neighbours sit at least 60 degrees apart. Emoji are no longer shown anywhere in the interface. They remain in stored data and appear only in the copied group-chat summary.

## Shell

The shell is an open plane. The sidebar breakpoint is `68.8125rem` (1101px at the default font size) in both `globals.css` and `app.css`, so the shell and the `desk:` variant switch together at any browser font size.

- **From 1101px:** a 240px labelled sidebar on the page ground. It holds the mark, the household, New trip, Share live, History and, at the foot, Settings.
- **Below 1101px:** the same items fold into a 64px top bar.
- **Below 431px:** New trip shows as an icon. Its accessible name stays.

## Screens

Each screen answers one question first.

| Screen | Question | Biggest block |
| --- | --- | --- |
| New run | Who paid, and where is the receipt? | Payer choice and upload |
| Check receipt items | Is the scan right? | The editable item list |
| Claiming | What is mine? | The item list, with the roommate picker above |
| Settlement | Who owes the payer what? | What the payer gets back |
| Trip history | Which run was that? | One row per run |

The new-run screen also shows the last run as a ledger: what the payer gets back, and what each roommate owes so far with a thin proportional bar. Only a single largest share is drawn in ink, so equal shares read as equal. The payer's figure is the sum of the rounded amounts shown beneath it. With no history, the card lists each roommate's Venmo handle with a dash for the amount.

Amounts always add up to the bill. Each roommate's payment is rounded to the cent, and the payer keeps whatever cents remain. If rounding would collect more than the bill, the roommates whose amounts rounded up the most pay a cent less. If a basket discount is larger than the receipt, the bill is $0.00 rather than negative. Each settlement breakdown shows an adjustment line when its parts differ from its total. Claims from someone who has left the household go back to the shared pool.

Trip history also holds the CSV export. Each row has a checkbox for the export and a button to hide the run for the whole household; hidden runs are left out of exports.

Trip screens share one 896px content width, so the receipt-photo bar and the screen below it start on the same edge.

## House rules

These hold on every screen:

- No gradients, glass or blur.
- No shadows at rest. Dialogs keep one shadow because they float.
- No all-caps or tracked labels, and no eyebrow pills above headings.
- No emoji in the interface.
- No icons in tinted squares.
- Sentence case everywhere.
- One filled primary action per screen.

The Taste lint, `lint.mjs --app`, passes over all UI source with zero failures and zero warnings. Four dialog shadows, the default blue roommate colour and the group-chat emoji list carry `taste-skill-ignore` comments with their reasons.

## Accessibility

- Every screen has one `h1`.
- Form fields have labels tied to their inputs. Most are visible. The item name in a review row, and the roommate name and colour in the household editor, use `aria-label` because the row itself makes them clear.
- Toggles expose `aria-pressed`, and the settlement drawers expose `aria-expanded`.
- Dialogs use `role="dialog"` with labels, through `src/hooks/useModalDialog.ts`. Opening one moves focus inside, Tab stays inside it, and closing it returns focus to the control that opened it. Escape closes every dialog except two that need an answer: first-time household setup, and "Who are you?" on a shared trip link.
- The receipt-photo viewer is the browser's native modal `<dialog>`, which makes the page behind it inert.
- History rows are buttons.
- Focus rings use the accent.
- Motion is limited to feedback. The confetti and all transitions respect reduced motion.
- The share QR code is drawn locally as SVG by `src/components/TripQrCode.tsx`, so trip links never leave the app.

## Checks

Run before shipping a UI change:

```
npm run build
npx eslint
node --test tests/codex.test.mjs tests/server-db.test.mjs tests/trip-history.test.mjs
npx playwright test tests/app-design.spec.ts
```

`tests/app-design.spec.ts` mocks every API call, so it is safe anywhere.

The full `npx playwright test` also runs `tests/e2e-suite.spec.ts` and `tests/ui-audit.spec.ts`. Those reset the household in `data/database.json` to the defaults and add test trips. Run them only where that data is disposable, never against a deployment's data.

# Grocery Splitter

A mobile-first collaborative web application for roommates to scan grocery receipts, claim individual and shared line items, and calculate itemized balances including exact tax attribution and Venmo settlement links.

## Language

**Household**:
A persistent group of roommates sharing grocery expenses, each with a display name, theme color, and Venmo handle.
_Avoid_: Team, family, group, account

**Trip**:
A single grocery shopping event initiated by a payer with an uploaded receipt, itemized breakdown, and settlement balances.
_Avoid_: Session, order, cart, checkout

**Payer**:
The roommate who fronted the money at the grocery store and scanned the receipt.
_Avoid_: Host, owner, buyer

**Participant**:
A roommate in the household who claims items on a trip and owes a portion of the total.
_Avoid_: User, member, consumer, buyer

**Line Item**:
An individual product or service extracted from the receipt with a name, quantity, unit price, total price, and taxability status.
_Avoid_: Product, entry, grocery, charge

**Claim**:
The assignment of a line item (or specific quantity units of an item) to one or more participants.
_Avoid_: Assignment, allocation, tag

**Household Shared Item**:
A line item (or unassigned unit quantity) not claimed by a specific subset of participants, automatically split equally across all household participants.
_Avoid_: Unclaimed item, unassigned item, general grocery

**Taxable Item**:
A line item subject to state/local sales tax, as indicated on the receipt. Non-taxable items (e.g. exempt basic groceries) incur zero tax.
_Avoid_: Taxed product

**Tax Attribution**:
The distribution of sales tax exclusively among participants who claimed taxable items, weighted proportionally by their taxable item subtotal.
_Avoid_: Tax splitting, flat tax

**Line Discount**:
A discount or coupon tied to a specific line item, reducing that item's gross price directly for its claimants.
_Avoid_: Item coupon, markdown

**Basket Discount**:
A store-wide coupon or savings applied to the total grocery bill, distributed proportionally across all participants based on their individual subtotals.
_Avoid_: Order discount, global coupon, store promo

**Ready State**:
A non-blocking status indicator where participants mark themselves as finished claiming. Claims remain editable at any time without irreversible locking.
_Avoid_: Lock state, submission, checkout

**Settlement**:
The finalized breakdown of how much each participant owes the payer for a specific trip, with Venmo deep links and copyable chat summaries.
_Avoid_: Bill, invoice, payout

**Trip Archive**:
A persistent chronological record of all past grocery trips, itemized claims, and settlement breakdowns.
_Avoid_: Receipt box, history log, ledger

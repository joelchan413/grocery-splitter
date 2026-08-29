# Proportional Tax Attribution and Household Shared Defaults

Sales tax is attributed strictly to participants who claimed taxable line items, weighted proportionally by their taxable item subtotal, rather than splitting tax equally across the entire group. Any unassigned line items automatically split equally among all household members as shared staples.

## Context & Decision

Grocery receipts often mix untaxed essentials (produce, raw meat, staple grains) with taxable goods (prepared foods, alcoholic beverages, household cleaning supplies). Dividing total sales tax equally penalizes participants who only purchased untaxed essentials.

We calculate each participant's tax as:
`participant_tax = (participant_taxable_subtotal / total_taxable_subtotal) * total_receipt_tax`

Unclaimed items or remaining unassigned quantities default to Household Shared Items, dividing their cost evenly among all household participants unless explicitly assigned.

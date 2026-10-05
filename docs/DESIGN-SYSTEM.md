# Dermverse Design System

One visual language for every screen, invoice and receipt. The tokens live in
`frontend/src/styles/index.css` (UI) and `backend/apps/billing/pdf.py` (printed documents).
Change them there, not in individual screens.

## Brand & palette

The palette is sampled from the clinic's gold **JAD** monogram (`assets/logo-original.jpeg`).
The gold is set on warm espresso and ivory neutrals so it reads as quietly premium rather than flashy.

| Token | Hex | Use |
|---|---|---|
| `gold-100` | `#F4EDCC` | Champagne highlight (sampled) |
| `gold-300` | `#E4C275` | Light gold on dark surfaces (sampled) |
| `gold-500` | `#C38C2B` | Core brand gold (sampled) |
| `gold-600` | `#A8741F` | Charts, focus ring, active marks (passes 3:1 on white) |
| `gold-700` | `#865A12` | Gold **text** on light surfaces (5.6:1, AA) |
| `espresso` | `#1C1712` | Sidebar, hero panels, primary buttons |
| `ivory` | `#FAF7F2` | App background |
| `cream` | `#F4EFE6` | Subtle fills, table headers |
| `ink` / `ink-2` / `ink-3` | `#1E1913` / `#574E44` / `#776C60` | Text: primary (16:1), secondary (8:1), tertiary (5:1) |

**Status colours** are reserved for payment state and always come with an icon and a word:
Paid (green `#1F6B4A`), Partially paid (amber `#8A5A00`), Payment pending (red `#A23A24`),
Cancelled (grey `#5C5550`), Refund (blue `#2B5A78`).

## Typography

| Role | Font | Where |
|---|---|---|
| Display | **Cormorant Garamond** 600 | Page titles, clinic name, headline amounts. Echoes the calligraphic monogram. |
| UI & body | **Inter** 400–700 | Everything else: forms, tables and numbers (tabular figures). |

The base size is **15px**, slightly larger than usual so front-desk staff can read at a glance.
Fonts are bundled locally (`@fontsource`, and TTFs for PDFs), so the app looks the same with no internet.

| Class | Size | Use |
|---|---|---|
| `.t-display` | 2.15rem serif | Page title |
| `.t-title` | 1.55rem serif | Card / section title |
| `.t-heading` | 1.02rem semibold | Sub-headings |
| `.t-overline` | 0.72rem caps, tracked | Labels above values, table headers |
| `.t-num` | tabular figures | Every amount |

## Components

- **Buttons**: one `btn-gold` per screen for the signature action (New invoice, Create invoice, Receive payment).
  `btn-primary` (espresso) for confirmations, `btn-secondary` for alternatives, `btn-ghost` for low emphasis,
  and `btn-danger` only inside a confirmation step.
- **Field**: a label is always visible and linked to its control. Hints sit below, and errors replace hints with an icon and text.
- **Modal**: a centred dialog on desktop, a bottom sheet on phones. Focus moves to the first field. Footer actions are right-aligned.
- **StatusBadge**: icon + word + colour.
- **Segmented / mode picker**: real radio buttons underneath, so they work by keyboard and screen reader.
- **Charts**: one series in `gold-600`, thin columns with rounded tops, hairline grid, hover tooltip and a hidden data table.

## UX rules

1. Every screen answers *"what do I do next?"* An unpaid invoice shows its balance with a **Receive payment** button. After saving, the next steps are offered (print, WhatsApp, next invoice).
2. Minimum clicks for a basic invoice: patient → quick-add chip → **Create invoice** (payment defaults to full, mode remembers the last one used). Ctrl + Enter saves; Alt + N starts a new invoice from anywhere.
3. No database words. "Patient ID", not "UHID FK". "Balance due", not "receivable".
4. Money records are never edited or deleted. Corrections are refunds or cancellations with a reason, kept in history.
5. Responsive: sidebar on desktop, drawer on tablet and phone, tables become cards on phones, and a sticky total bar on the phone invoice screen.
6. Accessibility (WCAG 2.2 AA): text contrast at least 4.5:1, a visible gold focus ring everywhere, labelled inputs,
   errors announced with `role="alert"`, a skip link, reduced-motion support, and nothing conveyed by colour alone.

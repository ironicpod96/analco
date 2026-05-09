# AnalCo — Knowledge Library + Radio Button Gaps + First Impression Rebuild

You are working on AnalCo, a competitive UX analysis app built in React + Supabase.
Two CSVs are attached to this prompt. Use them as your source of truth for all changes.

---

## Attached files

1. `missing_knowledge_library.csv` — new principles to seed into the knowledge_principles table
2. `radio_button_gaps.csv` — new/modified input fields per category in the Compare card

---

## Task 1 — Seed missing knowledge library entries

Parse `missing_knowledge_library.csv` and write a Supabase migration or seed script that
inserts each row into the `knowledge_principles` table.

Schema reference:
```
knowledge_principles (
  id uuid primary key,
  category text,
  principle_name text,
  url text,
  gloss text,
  created_at timestamptz
)
```

Do not duplicate entries if principle_name + category already exists.
Run as an idempotent upsert.

---

## Task 2 — Add radio button gaps to Compare card

Parse `radio_button_gaps.csv` and add each field to the correct category section
in the Compare card UI.

Field types:
- `radio` → 3-dot radio group (0/1/2), left_label on far left, right_label on far right,
  same visual pattern as all existing criteria
- `number` → small number input field, store as integer
- `checkbox` → single checkbox, checked = issue flagged, stores as boolean

Placement rules:
- Add new fields BELOW existing fields within the same category section
- Maintain the 2-column grid layout for radio pairs
- Checkboxes go in a "Flags" subsection if one exists, otherwise create it
- Number inputs sit on their own row with a label

Storage: all new field values save to `criteria_ratings` using field_name as the key.
If the table uses a JSONB column no schema change needed; if fixed columns, add migrations.

Miller's Law auto-flag: when L1 item count > 7, automatically set a warning state on
the Navigation category indicator dot (yellow) and surface the Miller's Law principle
card inline without requiring a manual trigger.

---

## Task 3 — Rebuild First Impression section

### Current state
First Impression is AI-only — no human radio inputs. The AI generates a summary
sentence + bullet points with sentiment emoji. There is a green/yellow/red dot
indicating overall sentiment.

### What to build

Split First Impression into two sub-sections within the card:

**Sub-section A — AI analysis (keep existing)**
- Summary sentence (bold)
- Bullet points with sentiment emoji
- Dot indicator: derives from AI sentiment (keep as is)
- Add a scope badge toggle: "HERO ONLY" or "FULL PAGE"
  User sets this before running AI — it changes the prompt scope sent to the API

**Sub-section B — Human rating (new)**
Add these three radio fields from the CSV:
- CTA above fold (absent → present)
- Hero clarity (confusing → clear)
- Section count (overloaded → focused)

These three human ratings feed into the First Impression category score
alongside the AI sentiment.

Score calculation for First Impression:
- AI sentiment: positive bullet majority = 2, mixed = 1, negative majority = 0
- Human ratings: average of the three radio values (0–2 each)
- Final category score = weighted average: AI 50% + Human 50%
- This replaces the previous AI-only scoring for this category

Update the category dot indicator to reflect the combined score, not AI-only.

---

## Task 4 — Update scoring model documentation

Add a comment block or README section explaining the updated scoring model:

| Category          | AI input                  | Human input                              | Score formula                        |
|-------------------|---------------------------|------------------------------------------|--------------------------------------|
| Page Performance  | PageSpeed score (auto)    | none                                     | PageSpeed score directly             |
| First Impression  | Sentiment score (0–2)     | 3 radios avg (0–2)                       | 50% AI + 50% human                   |
| Navigation        | none                      | 4 radios + L1 count flag                 | avg of radio values                  |
| Task Completion   | none                      | 3 existing + 2 new radios                | avg of all radio values              |
| Visual Hierarchy  | none                      | 4 existing + 2 new radios + checkboxes   | avg of radios; flags informational   |
| Consistency       | none                      | 4 existing + 2 existing + 1 new checkbox | avg of radios; flags informational   |
| Accessibility     | PageSpeed score (auto)    | 1 new checkbox (keyboard nav)            | PageSpeed score; checkbox info only  |
| Help & Support    | none                      | 2 existing + 1 new radio                 | avg of all radio values              |

---

## General constraints
- React + Tailwind + Supabase
- Anthropic API: claude-sonnet-4-20250514
- Do not break existing Compare card layout or screenshot implementation
- All changes are additive — nothing is removed
- Preserve existing criteria_ratings data for sites already analyzed

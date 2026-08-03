# How to start Claude Code on this project

## Setup before first run

```
opshub/
├── CLAUDE.md          ← read automatically every session
├── BUILD_PLAN.md      ← the phased task list
└── db/
    ├── docker-compose.yml
    ├── schema.sql
    └── README.md
```

```bash
cd opshub
git init
cd db && docker compose up -d && cd ..
git add . && git commit -m "Initial: schema, docker, agent instructions"
```

Create the GitHub repo and push **before** the agent generates anything, so
every change after this point is diffable and reversible.

---

## First prompt

> Read CLAUDE.md, BUILD_PLAN.md, and db/schema.sql before doing anything.
> Then work through Phase 0 and Phase 1 of BUILD_PLAN.md.
>
> Verify each step for real — actually call the endpoints and show me the
> responses, don't just tell me the code is correct. Commit working increments
> as you go. Check off items in BUILD_PLAN.md as you complete them.
>
> Stop and ask me if anything is ambiguous or if a decision would be expensive
> to reverse later.

## Resuming in a later session

> Read CLAUDE.md and BUILD_PLAN.md. Continue from the first unchecked item.

The checkboxes are the memory between sessions — that's why the agent commits
updates to them.

---

## Things worth doing as the human

- **Review at phase boundaries**, not every commit. Phase 2 in particular:
  that's the first working slice, and mistakes in its shape get copied into
  every module after it.
- **Watch the migration setup in Phase 1.** If Prisma baselining goes wrong,
  schema drift shows up much later and is annoying to untangle.
- **Have Azure AD details ready before Phase 3** — app registration, tenant ID,
  client ID, redirect URI. The agent will stall there without them.
- **If the agent starts a second module before finishing the current one**,
  stop it. Half-finished parallel modules are the main way this kind of build
  goes sideways.
- **If output quality drifts in a long session**, start a fresh session. The
  CLAUDE.md + BUILD_PLAN.md combination is designed to make that cheap.

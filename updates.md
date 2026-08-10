# Updates

Newest first. One terse entry per finished task.

## 2026-08-09 — merged poster chrome onto the 3D rebuild + re-skinned in-game UI
Resolved the stash onto the pulled 3D diorama; play HUD, hint, target bar and
unit sheet re-skinned from dark glass to war-office paper. `.dark` removed.
All green: typecheck, build, 22 sim, 5 e2e (baselines regenerated).
Touched: src/app/{play,unit-sheet,home,war}.tsx, index.html, ui.md, cliffnotes.md

## 2026-08-09 — propaganda-poster redesign of homepage + app chrome
Rebuilt landing, war room, rally, 404, auth chrome as WWII recruitment-poster
theme (aged paper, hard shadows, stamps, ticker, AI-generated silkscreen
posters via GPT Image 2, live front tickers). e2e baselines regenerated.
Touched: src/app/{home,layout,war,rally,error-boundary,poster,sign-in,sign-up,dashboard}.tsx, src/styles/app.css, index.html, public/posters/, ui.md

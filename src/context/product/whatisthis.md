# Sketchloop (aka Deving) — Project Overview

> A prompt-to-design-to-code platform. Describe a UI, get a visual mockup, get production-ready code.

---

## Concept

Sketchloop is an AI-powered pipeline that takes a natural language prompt and converts it into:
1. A **visual UI mockup / design** (image)
2. **Frontend code** (HTML/CSS/JS or React) ready to use

Think: Google Stitch, but builder-focused and developer-native.

---

## How It Works (Pipeline)

```
User Prompt
    │
    ▼
[Flux] — Image Generation
    │  Generates a UI screenshot/mockup from the prompt
    ▼
[LLaMA Vision] — UI Analysis
    │  Analyzes the generated image, extracts layout/components
    ▼
[Groq] — Code Generation
    │  Converts the UI analysis into clean frontend code
    ▼
Output: Visual Mockup + Code
```

---

## Tech Stack

| Layer | Tool |
|---|---|
| Infrastructure | Cloudflare Workers AI |
| Image Generation | Flux |
| Vision / UI Analysis | LLaMA Vision |
| Code Generation | Groq (LLaMA-based) |
| Orchestration | Custom linear pipeline (no LangGraph) |

**Why no LangGraph?** The pipeline is linear — prompt → image → analysis → code. No branching or agent loops needed, so LangGraph added unnecessary complexity.

---

## Name History

Explored names before landing on Sketchloop:
- **Sketchode** — sketch + code
- **Wipframe** — wireframe vibes
- **Vibuild** — vibe + build

**Sketchloop** / **Deving** — current contenders.

---

## Inspiration / Competitive Reference

- **Google Stitch** — closest concept competitor
- Targets developers and indie builders who want to go from idea → UI → code fast

---

## Current Status

- Pipeline architecture decided
- Stack finalized (Flux + LLaMA Vision + Groq on Cloudflare Workers AI)
- Domain/naming being explored
- Build in progress

---

## Open Questions / Next Steps

- [ ] Finalize name (Sketchloop vs Deving vs something else)
- [ ] Domain acquisition
- [ ] Frontend for the platform itself (UI for input/output)
- [ ] Output quality tuning (Flux prompt engineering, code accuracy)
- [ ] Positioning: dev tool, no-code tool, or both?
- [ ] Monetization model (freemium / credits / SaaS)

---

*Last updated based on conversations with Abhishek — May 2026*
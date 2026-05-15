# Margin

**Marking Sources, Building Arguments with AI**

An AI-assisted writing tool that scaffolds the source-to-argument stage of academic writing — the interval between reading a source and producing prose. Margin splits the writing workflow along the planning/translating boundary defined by Flower and Hayes (1981), reserving planning entirely for the user and restricting AI to linguistic stitching.

Built for **junior academic writers** (undergraduates and early graduate students) working on lit reviews, response essays, and commentary papers.

MACSS 30200 · Project C · Spring 2026 · Jiahang Luo

---

## Setup

**Requirements**: Node.js 18+, an OpenAI API key.

1. Clone this repository:
```bash
   git clone <repo-url>
   cd reading-lenses
```

2. Install dependencies:
```bash
   npm install
```

3. Set up your API key:
```bash
   cp .env.example .env
```
   Then open `.env` and replace `your-openai-api-key-here` with an actual OpenAI key from https://platform.openai.com/api-keys.

4. Start the dev server:
```bash
   npm run dev
```

5. Open the URL Vite reports (usually http://localhost:5173).

---

## How it works

Margin is a four-step workflow:

1. **Upload** — paste or upload a text-heavy source (article, op-ed, book chapter; up to ~25,000 characters). The system parses it with GPT-4o-mini into argumentative segments.

2. **Read & Mark** — the source is displayed as a hierarchical skeleton: each segment tagged as Claim, Evidence, Concession, or Gap, with non-Claim segments visually nested under the Claim they serve. The user clicks "+" on segments they may want to use.

3. **Build** — the user writes their **take** (their argument, in their own words — AI does not assist here) and drags marked segments into three stance-based slots: *What I agree with*, *What I disagree with*, *Something else I want to use*.

4. **Draft** — AI stitches the assembled structure into prose, restricted to material the user has explicitly placed. An authorship trace shows what percentage is still AI-generated and what the user has added or cut.

---

## Tech stack

- **React** + **Vite** (frontend)
- **OpenAI API** with `gpt-4o-mini` (parsing and draft generation)
- **pdf.js** loaded via CDN (for PDF text extraction)

All UI, prompt logic, and state management live in a single React component (`src/App.jsx`) to keep the prototype self-contained.

---

## Project structure

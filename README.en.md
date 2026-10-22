# TailorCV

TailorCV is a private resume-tailoring workspace built around one rule: every claim in a tailored resume must be traceable to the user's Master Career Profile.

## Product flow

1. Upload a PDF, DOCX, or TXT CV.
2. Paste the company's job requirements.
3. Click **Update my CV**.
4. Review the draft against your original CV and download PDF or DOCX.

The editor distinguishes an AI rewrite from a source-only draft when the model is unavailable. It also identifies job requirements that are not established by the uploaded CV.

## Architecture

- `components/tailorcv/app-shell.tsx` — focused upload → requirements → editor flow.
- `components/tailorcv/resume-preview.tsx` — selectable-text A4/Letter preview and print styling.
- `lib/domain/*` — Zod models, parsing, job analysis, deterministic matching, tailoring, and traceability validation.
- `lib/ai/openrouter.ts` — two-model OpenRouter pipeline: MiniMax M3 plans against evidence; GLM 5.2 writes the ATS-focused CV.
- `lib/ai/service.ts` — deterministic fallback and optional legacy OpenAI provider.
- `app/api/*` — server-only routes for parsing, analysis, persistence, cover letters, and matched PDF/DOCX generation.
- `db/schema.ts` — D1 schema for users, immutable-ish master profile source, applications, versions, and uploaded-file metadata.
- `R2 FILES` stores uploaded resume bytes; D1 stores searchable metadata and structured JSON.

OpenRouter uses `POST /api/v1/chat/completions` with JSON output. `OPENROUTER_AGENT_MODEL` selects relevant source evidence, then `OPENROUTER_WRITING_MODEL` rewrites only those existing facts. The writer also returns a truthful role headline, grouped technical skills, and relevance-based experience and project ordering. IDs, technologies, claims, and numbers are validated server-side before a change reaches the editor. If the key is absent, a model is rate-limited, or a response fails validation, deterministic tailoring remains available and is labelled in the UI.

The editor, PDF, and DOCX share one ATS-friendly visual system: single-column content, standard section names, grouped skills, preserved project links, and compact one-page-first spacing.

## Run locally

```bash
npm install
npm run dev
```

Local Sites dev provisions the D1/R2 bindings declared in `.openai/hosting.json`. This public source snapshot includes only binding names, not the original private Site's project ID. To publish your own instance, connect the project to a new Site and use its generated hosting configuration. Existing uploads, database contents, API keys, and deployment history are not included.

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

Useful checks:

```bash
npm run build
npm run lint
npm test
```

Copy `.env.example` to `.env`, add `OPENROUTER_API_KEY`, and keep the two supplied model values. For production, configure the same values as server-side Site environment variables; never expose the API key to the browser.

## Truthfulness safeguards

- Requirements without evidence are explicitly marked Missing and are never added to the resume.
- Partial matches show related evidence without overstating it.
- Every generated suggestion stores `sourceReference` with entity, field, and excerpt.
- Suggested numbers must already exist in the referenced evidence or the suggestion is flagged for review.
- The Master Profile is only updated by an explicit save from the profile editor; tailored edits operate on a separate `ResumeVersion`.
- The internal match score is clearly labeled as a relevance estimate, not a company's ATS score.

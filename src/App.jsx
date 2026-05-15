import React, { useState, useEffect, useMemo, useRef } from 'react';

// ============================================================
// MARGIN — Prototype v4
// Target: junior academic writers (undergrad / early grad)
// Use case: lit review, commentary, source-driven essays
//
// Major changes from v3.2:
//   - Lens selection removed (the Build-on / Position distinction
//     proved to be vocabulary novices don't have). Replaced with
//     three universal slots that work regardless of stance.
//   - Tag vocabulary reduced from 7 to 4 (Claim/Evidence/Concession/Gap)
//   - Step 2 redesigned: skeleton visualization grouped by section,
//     with evidence/concession/gap indented under their parent claim
//   - "+" pin mechanic added: Step 2 marks segments;
//     Step 3 library shows only pinned ones by default
//   - Steps 4a (Place) + 4b (Relate) merged into a single Step 3 (Build)
//   - Total flow: 5 steps → 4 steps
// ============================================================

const OPENAI_ENDPOINT = '/openai/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o-mini';

const MAX_INPUT_CHARS = 25000;
const MIN_INPUT_CHARS = 200;

// ----------------------------------------------------------------
// TAG SYSTEM — 4 categories chosen for junior writers
// ----------------------------------------------------------------
const TAG_COLORS = {
  Claim:      { bg: '#FDECC8', border: '#D9A441', text: '#7A5217' }, // amber
  Evidence:   { bg: '#DBEDDB', border: '#4F8A4F', text: '#2A5A2A' }, // green
  Concession: { bg: '#E8DEEE', border: '#8E5BAE', text: '#5A3A78' }, // purple
  Gap:        { bg: '#DDE7F1', border: '#4A7BB8', text: '#2A4A78' }, // blue
};
const ALL_TAGS = Object.keys(TAG_COLORS);

// ----------------------------------------------------------------
// SLOTS — agreement-based, replacing the earlier "type-based" slots
// (Build-on / Position lenses are also gone — see Step 3 redesign.)
// Each slot accepts ANY tag; placement = stance.
// ----------------------------------------------------------------
const SLOTS = [
  { id: 'agree',  label: 'What I agree with',
    accepts: ['Claim', 'Evidence', 'Concession', 'Gap'], multi: true,
    instruction: 'Material from the source that supports my take, or that I want to cite approvingly.',
    stance: 'agree' },
  { id: 'disagree', label: 'What I disagree with',
    accepts: ['Claim', 'Evidence', 'Concession', 'Gap'], multi: true,
    instruction: 'Material I want to push back on, contradict, or treat as a limitation.',
    stance: 'disagree' },
  { id: 'else', label: 'Something else I want to use',
    accepts: ['Claim', 'Evidence', 'Concession', 'Gap'], multi: true,
    instruction: 'Anything that doesn\'t fit agree/disagree — context, framing, a phrase I want to borrow, a gap I want to fill. Tell me what you want it for next to each piece.',
    stance: 'else',
    requiresPurpose: true },
];

const FREE_TEXT_FIELDS = [
  { id: 'position', label: 'My take',
    placeholder: 'In one or two sentences, what do you want to say?' },
  { id: 'voice', label: 'How I want this to sound', optional: true,
    placeholder: 'Tone, framing, or style notes — formal, conversational, skeptical, etc. (optional)' },
];

// ----------------------------------------------------------------
// DEMO SOURCE
// ----------------------------------------------------------------
const DEMO_SOURCE = {
  title: "Why AI Writing Tools Are Quietly Hollowing Out Student Thinking",
  author: "Margaret Voss",
  publication: "The Atlantic, March 2024",
  fullText: `There is a familiar story being told about AI writing tools in the classroom: that they are simply the next chapter in a long history of writing aids, no different in kind from spellcheck or the calculator. This story is wrong, and it is wrong in a way that matters.

The difference is not technical. It is structural. Spellcheck does not decide what you mean to say. A calculator does not choose which problem you should solve. But AI writing tools, as currently designed, do something more ambitious: they collapse the space between intention and prose. The student no longer moves from confusion, to reading, to provisional thinking, to sentence. They move from prompt to paragraph.

Recent studies indicate that students who use AI writing tools regularly score lower on independent essay assessments than peers who do not. Granted, the studies are small, and the effect sizes modest. But the direction is consistent across institutions.

Defenders of these tools argue that they free students from the mechanical labor of writing so they can focus on higher-order thinking. This claim assumes that mechanical labor and higher-order thinking are separable. They are not. Writing is the medium in which thinking happens for many learners. Removing the labor of writing does not free the thinking; it removes the conditions under which the thinking forms.

The deeper problem is that current AI tools are designed around the wrong question. They ask: how can we make writing easier? The better question is: which parts of writing should be made easier, and which should be preserved as productive struggle?

We need tools that distinguish between bad friction and good friction. Bad friction includes formatting, citation management, and clunky phrasing. Good friction includes deciding what you think, choosing what to defend, and figuring out where you stand in a conversation that began before you arrived.

Until AI tool designers take this distinction seriously, we should be skeptical of claims that these tools augment learning. They may simply be optimizing for the appearance of learning while removing the conditions that produce it.`
};

const DEMO_SECTIONS = [
  { id: 'sec1', label: 'The Familiar Story' },
  { id: 'sec2', label: 'How AI Tools Differ' },
  { id: 'sec3', label: 'Empirical Evidence' },
  { id: 'sec4', label: "Defenders' View" },
  { id: 'sec5', label: 'Reframing the Question' },
  { id: 'sec6', label: 'Conclusion' },
];

const DEMO_SEGMENTS = [
  { id: 's1', sectionId: 'sec1', parentClaimId: null, primaryTag: 'Claim',      altTags: [], text: "This story is wrong, and it is wrong in a way that matters.", note: "Author's central thesis" },
  { id: 's2', sectionId: 'sec2', parentClaimId: null, primaryTag: 'Claim',      altTags: [], text: "But AI writing tools, as currently designed, do something more ambitious: they collapse the space between intention and prose.", note: "Sub-claim about what makes AI tools different" },
  { id: 's3', sectionId: 'sec2', parentClaimId: 's2',  primaryTag: 'Evidence',   altTags: [], text: "The student no longer moves from confusion, to reading, to provisional thinking, to sentence. They move from prompt to paragraph.", note: "Vivid illustration of the collapse" },
  { id: 's4', sectionId: 'sec3', parentClaimId: 's1',  primaryTag: 'Evidence',   altTags: [], text: "Recent studies indicate that students who use AI writing tools regularly score lower on independent essay assessments than peers who do not.", note: "Empirical support for the central thesis" },
  { id: 's5', sectionId: 'sec3', parentClaimId: 's4',  primaryTag: 'Concession', altTags: [], text: "Granted, the studies are small, and the effect sizes modest. But the direction is consistent across institutions.", note: "Author concedes evidence limitations" },
  { id: 's6', sectionId: 'sec4', parentClaimId: null,  primaryTag: 'Concession', altTags: [], text: "Defenders of these tools argue that they free students from the mechanical labor of writing so they can focus on higher-order thinking.", note: "Acknowledges opposing view before countering" },
  { id: 's7', sectionId: 'sec4', parentClaimId: null,  primaryTag: 'Claim',      altTags: [], text: "Writing is the medium in which thinking happens for many learners. Removing the labor of writing does not free the thinking; it removes the conditions under which the thinking forms.", note: "Counter-claim against defenders' view" },
  { id: 's8', sectionId: 'sec5', parentClaimId: null,  primaryTag: 'Claim',      altTags: [], text: "The deeper problem is that current AI tools are designed around the wrong question.", note: "Reframes the design question" },
  { id: 's9', sectionId: 'sec5', parentClaimId: 's8',  primaryTag: 'Gap',        altTags: [], text: "The better question is: which parts of writing should be made easier, and which should be preserved as productive struggle?", note: "Names what current tools fail to ask" },
  { id: 's10',sectionId: 'sec5', parentClaimId: 's8',  primaryTag: 'Claim',      altTags: [], text: "We need tools that distinguish between bad friction and good friction.", note: "Normative criterion the author proposes" },
  { id: 's11',sectionId: 'sec6', parentClaimId: null,  primaryTag: 'Claim',      altTags: [], text: "Until AI tool designers take this distinction seriously, we should be skeptical of claims that these tools augment learning.", note: "Concluding stance" },
];

// ----------------------------------------------------------------
// PDF text extraction (CDN-loaded pdf.js)
// ----------------------------------------------------------------
const PDFJS_VERSION = '4.0.379';
let pdfjsLoadPromise = null;
function loadPdfJs() {
  if (pdfjsLoadPromise) return pdfjsLoadPromise;
  pdfjsLoadPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement('script');
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
    s.type = 'module';
    s.onload = () => {
      const tryResolve = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;
          resolve(window.pdfjsLib);
        } else { setTimeout(tryResolve, 50); }
      };
      tryResolve();
    };
    s.onerror = () => reject(new Error('Failed to load pdf.js from CDN.'));
    document.head.appendChild(s);
  });
  return pdfjsLoadPromise;
}
async function getPdfJs() {
  try {
    const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
    return pdfjsLib;
  } catch (e) {
    return loadPdfJs();
  }
}
async function extractPdfText(file) {
  const pdfjs = await getPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    out += pageText + '\n\n';
  }
  return out.trim();
}

// ================================================================
// MAIN COMPONENT
// ================================================================
export default function Margin() {
  const [stage, setStage] = useState('upload');     // upload | review | build | draft
  const [source, setSource] = useState(null);
  const [segments, setSegments] = useState([]);
  const [sections, setSections] = useState([]);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [skeletonState, setSkeletonState] = useState({});
  const [purposeState, setPurposeState] = useState({}); // { segmentId: "user-typed purpose string" } — only used for "else" slot
  const [freeTexts, setFreeTexts] = useState({});
  const [draft, setDraft] = useState('');
  const [aiBaseline, setAiBaseline] = useState('');
  const [hasGeneratedDraft, setHasGeneratedDraft] = useState(false);
  const [showDriftWarning, setShowDriftWarning] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [generationError, setGenerationError] = useState(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Geist:wght@300;400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  const loadDemo = () => {
    setSource(DEMO_SOURCE);
    setSegments(DEMO_SEGMENTS.map(s => ({ ...s })));
    setSections(DEMO_SECTIONS);
    setStage('review');
  };

  const handleParsedSource = (s, segs, secs) => {
    setSource(s); setSegments(segs); setSections(secs);
    setStage('review');
  };

  const stageNumber = ({ upload: 1, review: 2, build: 3, draft: 4 })[stage];
  const stageLabel  = ({ upload: 'Upload', review: 'Read & mark', build: 'Build', draft: 'Draft' })[stage];

  // Drift detection — only after substantive editing past the AI baseline
  useEffect(() => {
    if (!draft || !freeTexts.position) { setShowDriftWarning(false); return; }
    if (draft.length < 400) { setShowDriftWarning(false); return; }
    if (aiBaseline && draft.trim() === aiBaseline.trim()) { setShowDriftWarning(false); return; }
    const pos = new Set(freeTexts.position.toLowerCase().split(/\W+/).filter(w => w.length > 5));
    if (pos.size < 2) { setShowDriftWarning(false); return; }
    const d = new Set(draft.toLowerCase().split(/\W+/).filter(w => w.length > 5));
    let overlap = 0; pos.forEach(w => { if (d.has(w)) overlap++; });
    setShowDriftWarning(overlap / pos.size < 0.2);
  }, [draft, freeTexts.position, aiBaseline]);

  const handleReset = () => {
    setStage('upload'); setSource(null); setSegments([]); setSections([]);
    setPinnedIds(new Set()); setSkeletonState({}); setPurposeState({});
    setFreeTexts({}); setDraft(''); setAiBaseline(''); setHasGeneratedDraft(false);
    setGenerationError(null);
  };

  const togglePin = (id) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F4', color: '#1A1A1A', fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 400, lineHeight: 1.55 }}>
      <Header stageNumber={stageNumber} stageLabel={stageLabel} onReset={handleReset} />

      <main style={{ maxWidth: stage === 'review' || stage === 'build' ? 1280 : 920, margin: '0 auto', padding: '48px 32px 96px' }}>
        {stage === 'upload' && <UploadView onLoadDemo={loadDemo} onParsed={handleParsedSource} />}

        {stage === 'review' && (
          <ReviewView
            source={source} segments={segments} sections={sections}
            pinnedIds={pinnedIds} onTogglePin={togglePin}
            onUpdateTag={(id, t) => setSegments(prev => prev.map(s => s.id === id ? { ...s, primaryTag: t } : s))}
            onContinue={() => setStage('build')}
          />
        )}

        {stage === 'build' && (
          <BuildView
            segments={segments} sections={sections} pinnedIds={pinnedIds}
            skeletonState={skeletonState} purposeState={purposeState} freeTexts={freeTexts}
            onDropSegment={(slotId, segId) => {
              setSkeletonState(prev => {
                const next = { ...prev };
                const slot = SLOTS.find(s => s.id === slotId);
                if (!slot.multi) next[slotId] = [segId];
                else next[slotId] = [...(prev[slotId] || []).filter(id => id !== segId), segId];
                return next;
              });
              // No purpose needed by default — only "else" slot requires it,
              // and we initialize lazily when user types in the field
            }}
            onRemoveSegment={(slotId, segId) => {
              setSkeletonState(prev => ({ ...prev, [slotId]: (prev[slotId] || []).filter(id => id !== segId) }));
              setPurposeState(prev => { const n = { ...prev }; delete n[segId]; return n; });
            }}
            onUpdatePurpose={(segId, value) => setPurposeState(prev => ({ ...prev, [segId]: value }))}
            onUpdateFreeText={(fid, v) => setFreeTexts(prev => ({ ...prev, [fid]: v }))}
            onBack={() => setStage('review')}
            onContinue={() => setStage('draft')}
          />
        )}

        {stage === 'draft' && (
          <DraftView
            segments={segments} skeletonState={skeletonState} purposeState={purposeState} freeTexts={freeTexts}
            draft={draft} setDraft={setDraft}
            aiBaseline={aiBaseline} setAiBaseline={setAiBaseline}
            hasGeneratedDraft={hasGeneratedDraft} setHasGeneratedDraft={setHasGeneratedDraft}
            showDriftWarning={showDriftWarning} dismissDrift={() => setShowDriftWarning(false)}
            aiBusy={aiBusy} setAiBusy={setAiBusy}
            generationError={generationError} setGenerationError={setGenerationError}
            onBack={() => setStage('build')}
          />
        )}
      </main>

      <footer style={{ textAlign: 'center', padding: '32px', fontSize: 12, color: '#3A3A3A', fontFamily: "'Geist', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase', borderTop: '1px solid #EAE4D8', marginTop: 64 }}>
        Margin · Marking sources, building arguments with AI · Prototype v4
      </footer>
    </div>
  );
}

function Header({ stageNumber, stageLabel, onReset }) {
  return (
    <header style={{ borderBottom: '1px solid #EAE4D8', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAF8F4', position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(8px)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontStyle: 'italic', fontSize: 22, letterSpacing: '-0.02em' }}>Margin</span>
        <span style={{ fontSize: 11, color: '#3A3A3A', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Step {stageNumber} of 4 · {stageLabel}</span>
      </div>
      <button onClick={onReset} style={{ background: 'transparent', border: 'none', color: '#3A3A3A', fontSize: 12, cursor: 'pointer', fontFamily: "'Geist', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase' }}
        onMouseEnter={e => e.target.style.color = '#1A1A1A'} onMouseLeave={e => e.target.style.color = '#3A3A3A'}>Start over</button>
    </header>
  );
}

// ================================================================
// STAGE 1: UPLOAD
// ================================================================
function UploadView({ onLoadDemo, onParsed }) {
  const [mode, setMode] = useState('chooser');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtractError(null);
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setExtracting(true);
      try {
        const t = await extractPdfText(file);
        if (!t || t.length < 50) throw new Error('Could not extract readable text. The PDF may be a scanned image.');
        setText(t);
        if (!title) setTitle(file.name.replace(/\.pdf$/i, ''));
        setMode('edit');
      } catch (err) { setExtractError(err.message || 'PDF extraction failed.'); }
      finally { setExtracting(false); }
    } else if (file.type.startsWith('text/') || /\.(txt|md)$/i.test(file.name)) {
      try {
        const t = await file.text();
        setText(t);
        if (!title) setTitle(file.name.replace(/\.(txt|md)$/i, ''));
        setMode('edit');
      } catch (err) { setExtractError('Failed to read text file.'); }
    } else {
      setExtractError('Unsupported file type. Please upload PDF, TXT, or MD.');
    }
    e.target.value = '';
  };

  const parseWithAI = async () => {
    const t = text.trim();
    if (t.length < MIN_INPUT_CHARS) { setParseError(`Need at least ${MIN_INPUT_CHARS} characters. You have ${t.length}.`); return; }
    if (t.length > MAX_INPUT_CHARS) { setParseError(`Capped at ${MAX_INPUT_CHARS.toLocaleString()} characters.`); return; }
    setParsing(true); setParseError(null);

    const prompt = `You are an analytical reader helping a novice academic writer (undergraduate or early graduate) understand a source they need to write about.

Your job is to parse the source into a hierarchical structure that surfaces its argumentative skeleton.

STEP 1 — Segment the text into "idea units". Each segment is a piece of text that performs a single argumentative move.

STEP 2 — Tag each segment with ONE of these four categories ONLY:
- "Claim": an assertion the author advances (the author's own position or sub-position)
- "Evidence": material that supports a claim (data, examples, citations, expert testimony)
- "Concession": something the author acknowledges to opposing views (often "granted...", "of course...", "defenders argue...")
- "Gap": a place where the author names what is unresolved, future work, or under-specified

(Do NOT use Assumption, Framing, or Background — those categories do not exist in this system.)

STEP 3 — Group segments into 5-10 sections. Sections reflect natural argumentative movement (e.g., "Introduction", "Empirical Case", "Counter-Argument", "Reframing"). If the source has explicit headings, use them. If not, infer sections and give each a short 2-4 word label.

STEP 4 — For each Evidence, Concession, or Gap segment, assign a "parentClaimId" pointing to the Claim it most directly serves or contests. The parentClaimId MUST be a Claim segment in the SAME section. If no suitable Claim exists in the same section, use null.

Return STRICT JSON only — no preamble, no markdown fences. Schema:
{
  "sections": [
    { "id": "sec1", "label": "Introduction" }
  ],
  "segments": [
    { "id": "s1", "sectionId": "sec1", "text": "<exact verbatim>", "primaryTag": "Claim", "altTags": [], "note": "...", "parentClaimId": null }
  ]
}

Rules:
- Use exact verbatim text from the source.
- IDs sequential: s1, s2... and sec1, sec2...
- Skip purely transitional sentences.
- Aim for 15-40 segments total. Do not over-segment.
- parentClaimId for Claim segments is always null.
- Tags MUST be exactly one of: Claim, Evidence, Concession, Gap.

SOURCE TEXT:
${t}`;

    try {
      const response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 12000, temperature: 0.2,
          response_format: { type: 'json_object' },
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('Empty API response');

      let parsed;
      try { parsed = JSON.parse(content); }
      catch (e) {
        // partial recovery
        const segMatch = content.match(/"segments"\s*:\s*\[([\s\S]*)/);
        if (segMatch) {
          const lastClose = segMatch[1].lastIndexOf('}');
          if (lastClose > 0) {
            try {
              const secMatch = content.match(/"sections"\s*:\s*(\[[\s\S]*?\])/);
              const secArr = secMatch ? secMatch[1] : '[]';
              parsed = JSON.parse(`{"sections":${secArr},"segments":[${segMatch[1].slice(0, lastClose + 1)}]}`);
            } catch (e2) { throw new Error('Malformed JSON. Try a shorter source.'); }
          } else { throw new Error('Malformed JSON. Try a shorter source.'); }
        } else { throw new Error('Malformed JSON. Try a shorter source.'); }
      }

      const rawSegs = parsed.segments;
      const rawSecs = parsed.sections;
      if (!Array.isArray(rawSegs) || rawSegs.length === 0) throw new Error('No segments returned.');

      const cleanedSections = Array.isArray(rawSecs) && rawSecs.length > 0
        ? rawSecs.filter(s => s.id && s.label).map(s => ({ id: s.id, label: String(s.label).slice(0, 60) }))
        : [{ id: 'sec1', label: 'Source' }];
      const validSectionIds = new Set(cleanedSections.map(s => s.id));

      const cleaned = rawSegs.map((s, i) => ({
        id: s.id || `s${i + 1}`,
        sectionId: validSectionIds.has(s.sectionId) ? s.sectionId : cleanedSections[0].id,
        text: String(s.text || '').trim(),
        primaryTag: ALL_TAGS.includes(s.primaryTag) ? s.primaryTag : 'Claim',
        altTags: Array.isArray(s.altTags) ? s.altTags.filter(t => ALL_TAGS.includes(t)).slice(0, 2) : [],
        note: String(s.note || '').slice(0, 120),
        parentClaimId: s.parentClaimId || null,
      })).filter(s => s.text.length > 10);

      if (cleaned.length === 0) throw new Error('No valid segments after cleaning.');

      const claimIds = new Set(cleaned.filter(s => s.primaryTag === 'Claim').map(s => s.id));
      cleaned.forEach(s => {
        if (s.parentClaimId && !claimIds.has(s.parentClaimId)) s.parentClaimId = null;
        if (s.primaryTag === 'Claim') s.parentClaimId = null;
      });

      const sourceObj = {
        title: title.trim() || 'Untitled source',
        author: '', publication: 'Uploaded by user', fullText: t,
      };
      onParsed(sourceObj, cleaned, cleanedSections);
    } catch (err) {
      console.error('Parse failed:', err);
      setParseError(err.message || 'Parsing failed. Check API key and that Vite was restarted.');
    } finally { setParsing(false); }
  };

  if (mode === 'edit') {
    const tooLong = text.length > MAX_INPUT_CHARS;
    const tooShort = text.length < MIN_INPUT_CHARS;
    return (
      <div style={{ paddingTop: 40, maxWidth: 760, margin: '0 auto' }}>
        <p style={{ fontSize: 11, color: '#3A3A3A', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>Step 1 · Review your source</p>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.1, letterSpacing: '-0.03em', margin: '0 0 18px' }}>What are you reading?</h1>
        <p style={{ fontSize: 16, color: '#1A1A1A', lineHeight: 1.6, margin: '0 0 24px', fontFamily: "'Fraunces', serif", fontWeight: 300 }}>
          Edit the text below before parsing — remove headers, footnotes, page numbers, references, anything you don't want AI to analyze. The cleaner the input, the clearer the skeleton.
        </p>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Title (optional)"
          style={{ width: '100%', padding: '12px 14px', border: '1px solid #EAE4D8', borderRadius: 3, fontFamily: "'Fraunces', serif", fontSize: 16, background: '#FFFFFF', outline: 'none', marginBottom: 12 }} />
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Source text…"
          style={{ width: '100%', minHeight: 360, padding: '16px 18px', border: `1px solid ${tooLong ? '#C73E1D' : '#EAE4D8'}`, borderRadius: 3, fontFamily: "'Fraunces', serif", fontSize: 14, lineHeight: 1.6, background: '#FFFFFF', outline: 'none', resize: 'vertical' }}
          autoComplete="off" spellCheck={false} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '8px 0 24px' }}>
          <p style={{ fontSize: 12, color: tooLong ? '#C73E1D' : '#3A3A3A', margin: 0, fontFamily: "'Geist', sans-serif" }}>
            {text.length.toLocaleString()} / {MAX_INPUT_CHARS.toLocaleString()} characters
            {tooShort && ` — need at least ${MIN_INPUT_CHARS}`}
            {tooLong && ` — over limit by ${(text.length - MAX_INPUT_CHARS).toLocaleString()}`}
          </p>
          <button onClick={() => fileInputRef.current?.click()} style={{ background: 'transparent', border: 'none', color: '#3A3A3A', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: "'Geist', sans-serif" }}>Replace with another file</button>
        </div>
        {parseError && (
          <div style={{ background: '#FFF0EC', border: '1px solid #C73E1D', borderRadius: 3, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 12, color: '#C73E1D', margin: '0 0 6px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Parse failed</p>
            <p style={{ fontSize: 13, color: '#1A1A1A', margin: 0, fontFamily: "'Fraunces', serif", lineHeight: 1.5 }}>{parseError}</p>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={handleFileUpload} style={{ display: 'none' }} />
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={() => { setMode('chooser'); setParseError(null); }} disabled={parsing} style={ghostButtonStyle}>← Back</button>
          <button onClick={parseWithAI} disabled={parsing || tooShort || tooLong} style={{
            background: parsing || tooShort || tooLong ? '#D6CFC0' : '#1A1A1A',
            color: '#FAF8F4', border: 'none', padding: '12px 24px', fontSize: 14,
            fontFamily: "'Geist', sans-serif", fontWeight: 500,
            cursor: parsing ? 'wait' : (tooShort || tooLong ? 'not-allowed' : 'pointer'),
            borderRadius: 2, letterSpacing: '0.02em',
          }}>{parsing ? 'Parsing with AI…' : 'Parse with AI →'}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 80, textAlign: 'center' }}>
      <p style={{ fontSize: 11, color: '#3A3A3A', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 32 }}>For junior academic writers: lit reviews, commentary, source-driven essays</p>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 1.05, letterSpacing: '-0.03em', margin: '0 auto 28px', maxWidth: 720 }}>
        Don't skip the part <em style={{ fontStyle: 'italic', fontWeight: 300 }}>between</em> reading and writing.
      </h1>
      <p style={{ fontSize: 18, color: '#1A1A1A', maxWidth: 580, margin: '0 auto 56px', lineHeight: 1.6, fontFamily: "'Fraunces', serif", fontWeight: 300 }}>
        Upload a source. See its argumentative skeleton. Mark what you want to use. AI handles the language — never the logic.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={onLoadDemo} style={{
          background: '#1A1A1A', color: '#FAF8F4', border: 'none', padding: '14px 28px', fontSize: 14,
          fontFamily: "'Geist', sans-serif", fontWeight: 500, cursor: 'pointer', borderRadius: 2, letterSpacing: '0.02em',
        }}>Try the demo source</button>
        <button onClick={() => fileInputRef.current?.click()} disabled={extracting} style={{
          background: extracting ? '#D6CFC0' : 'transparent', color: '#1A1A1A', border: '1px solid #1A1A1A',
          padding: '14px 28px', fontSize: 14, fontFamily: "'Geist', sans-serif", fontWeight: 500,
          cursor: extracting ? 'wait' : 'pointer', borderRadius: 2, letterSpacing: '0.02em',
        }}>{extracting ? 'Extracting PDF…' : 'Upload PDF or text'}</button>
        <button onClick={() => setMode('edit')} style={{
          background: 'transparent', color: '#3A3A3A', border: '1px solid #D6CFC0',
          padding: '14px 28px', fontSize: 14, fontFamily: "'Geist', sans-serif", fontWeight: 500,
          cursor: 'pointer', borderRadius: 2, letterSpacing: '0.02em',
        }}>Paste text manually</button>
      </div>
      <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" onChange={handleFileUpload} style={{ display: 'none' }} />
      {extractError && (
        <div style={{ marginTop: 32, padding: '14px 18px', background: '#FFF0EC', border: '1px solid #C73E1D', borderRadius: 3, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto', textAlign: 'left' }}>
          <p style={{ fontSize: 12, color: '#C73E1D', margin: '0 0 6px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Upload failed</p>
          <p style={{ fontSize: 13, color: '#1A1A1A', margin: 0, fontFamily: "'Fraunces', serif", lineHeight: 1.5 }}>{extractError}</p>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#3A3A3A', marginTop: 64, fontStyle: 'italic', fontFamily: "'Fraunces', serif", maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
        Input capped at {MAX_INPUT_CHARS.toLocaleString()} characters (about an op-ed or short essay). Scanned PDFs and multi-column layouts may extract poorly — you'll have a chance to clean up.
      </p>
    </div>
  );
}

// ================================================================
// STAGE 2: REVIEW — skeleton visualization with pin
// ================================================================
function ReviewView({ source, segments, sections, pinnedIds, onTogglePin, onUpdateTag, onContinue }) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id);
  const [editingTagId, setEditingTagId] = useState(null);
  const sectionRefs = useRef({});

  const scrollToSection = (id) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // For each section: claims at top, non-claims indented under their parent
  const sectionSkeletons = useMemo(() => {
    return sections.map(sec => {
      const segs = segments.filter(s => s.sectionId === sec.id);
      const claims = segs.filter(s => s.primaryTag === 'Claim');
      const nonClaims = segs.filter(s => s.primaryTag !== 'Claim');
      const byParent = new Map();
      nonClaims.forEach(s => {
        const k = s.parentClaimId || '__orphan__';
        if (!byParent.has(k)) byParent.set(k, []);
        byParent.get(k).push(s);
      });
      return {
        section: sec, claims,
        orphans: byParent.get('__orphan__') || [],
        childrenByClaim: claims.reduce((acc, c) => { acc[c.id] = byParent.get(c.id) || []; return acc; }, {}),
      };
    });
  }, [segments, sections]);

  const pinnedCount = pinnedIds.size;

  return (
    <div>
      <SectionIntro
        eyebrow="Step 2"
        title="Read the skeleton, mark what you want to use."
        body={`AI has parsed the source into ${segments.length} pieces, grouped into ${sections.length} sections, with evidence and concessions nested under the claims they serve. Click the ＋ to mark any piece you might want in your own writing — you'll arrange them in the next step.`}
      />

      <div style={{ marginTop: 32, padding: '14px 20px', background: '#FFF8E8', border: '1px solid #C9B68A', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <p style={{ fontSize: 13, color: '#1A1A1A', margin: 0, fontFamily: "'Fraunces', serif" }}>
          <strong>{pinnedCount}</strong> {pinnedCount === 1 ? 'piece' : 'pieces'} marked for use
        </p>
        <p style={{ fontSize: 11, color: '#3A3A3A', margin: 0, letterSpacing: '0.05em', fontFamily: "'Geist', sans-serif" }}>
          Mark loosely now, refine later
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 40, marginTop: 32 }}>
        <aside style={{ position: 'sticky', top: 100, alignSelf: 'start', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
          <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#3A3A3A', margin: '0 0 12px', fontWeight: 500 }}>Sections</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sections.map((sec, i) => {
              const segs = segments.filter(s => s.sectionId === sec.id);
              const pinnedInSec = segs.filter(s => pinnedIds.has(s.id)).length;
              const isActive = activeSection === sec.id;
              return (
                <button key={sec.id} onClick={() => scrollToSection(sec.id)}
                  style={{
                    background: isActive ? '#1A1A1A' : 'transparent',
                    color: isActive ? '#FAF8F4' : '#1A1A1A',
                    border: 'none', padding: '8px 12px', textAlign: 'left',
                    cursor: 'pointer', borderRadius: 2, fontSize: 13,
                    fontFamily: "'Fraunces', serif",
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6,
                    transition: 'all 0.15s ease',
                  }}>
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: 10, opacity: 0.6, marginRight: 6 }}>{i + 1}.</span>
                    {sec.label}
                  </span>
                  {pinnedInSec > 0 && (
                    <span style={{
                      background: isActive ? '#FAF8F4' : '#1A1A1A',
                      color: isActive ? '#1A1A1A' : '#FAF8F4',
                      fontSize: 9, padding: '1px 5px', borderRadius: 8,
                      fontFamily: "'Geist', sans-serif", fontWeight: 600,
                    }}>{pinnedInSec}</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        <div>
          {sectionSkeletons.map(({ section, claims, orphans, childrenByClaim }) => (
            <div key={section.id} ref={el => sectionRefs.current[section.id] = el} style={{ marginBottom: 56 }}>
              <h3 style={{
                fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 30,
                margin: '0 0 20px', letterSpacing: '-0.02em', color: '#1A1A1A',
                paddingBottom: 10, borderBottom: '2px solid #1A1A1A',
              }}>{section.label}</h3>

              {claims.length === 0 && orphans.length === 0 && (
                <p style={{ fontSize: 13, color: '#3A3A3A', fontStyle: 'italic', fontFamily: "'Fraunces', serif" }}>
                  (No segments in this section.)
                </p>
              )}

              {claims.map(claim => (
                <div key={claim.id} style={{ marginBottom: 28 }}>
                  <SegmentCard
                    segment={claim}
                    pinned={pinnedIds.has(claim.id)}
                    onTogglePin={() => onTogglePin(claim.id)}
                    editingTag={editingTagId === claim.id}
                    onStartEditTag={() => setEditingTagId(claim.id)}
                    onUpdateTag={(t) => { onUpdateTag(claim.id, t); setEditingTagId(null); }}
                    onCancelEditTag={() => setEditingTagId(null)}
                    indent={0}
                  />
                  {childrenByClaim[claim.id]?.map(child => (
                    <SegmentCard
                      key={child.id}
                      segment={child}
                      pinned={pinnedIds.has(child.id)}
                      onTogglePin={() => onTogglePin(child.id)}
                      editingTag={editingTagId === child.id}
                      onStartEditTag={() => setEditingTagId(child.id)}
                      onUpdateTag={(t) => { onUpdateTag(child.id, t); setEditingTagId(null); }}
                      onCancelEditTag={() => setEditingTagId(null)}
                      indent={1}
                    />
                  ))}
                </div>
              ))}

              {orphans.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed #EAE4D8' }}>
                  <p style={{ fontSize: 10, color: '#3A3A3A', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 8px' }}>Unattached in this section</p>
                  {orphans.map(orphan => (
                    <SegmentCard
                      key={orphan.id}
                      segment={orphan}
                      pinned={pinnedIds.has(orphan.id)}
                      onTogglePin={() => onTogglePin(orphan.id)}
                      editingTag={editingTagId === orphan.id}
                      onStartEditTag={() => setEditingTagId(orphan.id)}
                      onUpdateTag={(t) => { onUpdateTag(orphan.id, t); setEditingTagId(null); }}
                      onCancelEditTag={() => setEditingTagId(null)}
                      indent={0}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          <ContinueRow
            onClick={onContinue}
            label={`Build with ${pinnedCount} marked piece${pinnedCount === 1 ? '' : 's'} →`}
            disabled={pinnedCount === 0}
            disabledMsg={pinnedCount === 0 ? 'Mark at least one piece (＋) before continuing.' : ''}
          />
        </div>
      </div>
    </div>
  );
}

function SegmentCard({ segment, pinned, onTogglePin, editingTag, onStartEditTag, onUpdateTag, onCancelEditTag, indent }) {
  const colors = TAG_COLORS[segment.primaryTag] || TAG_COLORS.Claim;
  const isChild = indent > 0;

  // Visual hierarchy:
  //   - Claim (indent 0): large, filled background using tag color, prominent
  //   - Child (indent 1+): smaller, indented, with vertical connector line on the left
  const cardStyle = isChild ? {
    marginLeft: 56,
    marginBottom: 6,
    background: pinned ? '#FFF8E8' : '#FFFFFF',
    border: `1px solid ${pinned ? '#C9B68A' : '#E0DACB'}`,
    borderRadius: 3,
    padding: '10px 14px',
    position: 'relative',
    transition: 'all 0.15s ease',
  } : {
    marginBottom: 4,
    background: pinned ? '#FFF8E8' : colors.bg,
    border: `1.5px solid ${pinned ? '#C9B68A' : colors.border}`,
    borderRadius: 4,
    padding: '14px 16px',
    transition: 'all 0.15s ease',
  };

  const textStyle = isChild ? {
    fontSize: 13, lineHeight: 1.5, margin: 0,
    fontFamily: "'Fraunces', serif", color: '#1A1A1A',
  } : {
    fontSize: 16, lineHeight: 1.5, margin: 0,
    fontFamily: "'Fraunces', serif", color: '#1A1A1A', fontWeight: 500,
  };

  return (
    <div style={cardStyle}>
      {/* connector line for child cards */}
      {isChild && (
        <div style={{
          position: 'absolute', left: -28, top: '50%',
          width: 22, height: 1, background: '#C0B8A6',
        }} />
      )}
      {isChild && (
        <div style={{
          position: 'absolute', left: -28, top: -10, bottom: '50%',
          width: 1, background: '#C0B8A6',
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <button onClick={onTogglePin} title={pinned ? 'Unmark' : 'Mark this piece for use'}
          style={{
            flexShrink: 0,
            width: isChild ? 22 : 26,
            height: isChild ? 22 : 26,
            borderRadius: '50%',
            background: pinned ? '#1A1A1A' : '#FFFFFF',
            color: pinned ? '#FAF8F4' : '#1A1A1A',
            border: `1px solid ${pinned ? '#1A1A1A' : '#1A1A1A'}`,
            cursor: 'pointer',
            fontSize: isChild ? 12 : 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Geist', sans-serif", transition: 'all 0.15s ease',
          }}
        >{pinned ? '✓' : '＋'}</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {editingTag ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                {ALL_TAGS.map(tag => (
                  <button key={tag} onClick={() => onUpdateTag(tag)} style={{
                    background: tag === segment.primaryTag ? TAG_COLORS[tag].bg : '#FFFFFF',
                    border: `1px solid ${TAG_COLORS[tag].border}`,
                    color: TAG_COLORS[tag].text,
                    padding: '3px 8px', borderRadius: 2,
                    fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase',
                    cursor: 'pointer', fontFamily: "'Geist', sans-serif",
                  }}>{tag}</button>
                ))}
                <button onClick={onCancelEditTag} style={{ background: 'transparent', border: 'none', color: '#1A1A1A', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>cancel</button>
              </div>
            ) : (
              <button onClick={onStartEditTag} style={{
                background: isChild ? colors.bg : '#FFFFFF',
                border: `1px solid ${colors.border}`,
                color: colors.text,
                padding: isChild ? '2px 8px' : '3px 10px',
                borderRadius: 2,
                fontSize: isChild ? 9 : 10,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                fontWeight: 700, cursor: 'pointer', fontFamily: "'Geist', sans-serif",
              }}>{segment.primaryTag}</button>
            )}
          </div>
          <p style={textStyle}>{segment.text}</p>
          {segment.note && (
            <p style={{ fontSize: 11, color: '#1A1A1A', margin: '6px 0 0', fontStyle: 'italic', fontFamily: "'Fraunces', serif", opacity: 0.75 }}>{segment.note}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ================================================================
// STAGE 3: BUILD — universal slots + relations + position
// ================================================================
function BuildView({ segments, sections, pinnedIds, skeletonState, purposeState, freeTexts, onDropSegment, onRemoveSegment, onUpdatePurpose, onUpdateFreeText, onBack, onContinue }) {
  const [draggedSeg, setDraggedSeg] = useState(null);
  const [shakeSlot, setShakeSlot] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const usedSegmentIds = new Set(Object.values(skeletonState).flat());

  const librarySegments = useMemo(() => showAll ? segments : segments.filter(s => pinnedIds.has(s.id)), [showAll, segments, pinnedIds]);

  const librarySections = useMemo(() => {
    return sections
      .map(sec => ({ section: sec, segments: librarySegments.filter(s => s.sectionId === sec.id) }))
      .filter(g => g.segments.length > 0);
  }, [sections, librarySegments]);

  const handleDrop = (slotId, accepts) => (e) => {
    e.preventDefault();
    if (!draggedSeg) return;
    if (!accepts.includes(draggedSeg.primaryTag)) {
      setShakeSlot(slotId);
      setTimeout(() => setShakeSlot(null), 500);
      setDraggedSeg(null);
      return;
    }
    onDropSegment(slotId, draggedSeg.id);
    setDraggedSeg(null);
  };

  const positionFilled = !!(freeTexts.position && freeTexts.position.trim().length > 10);
  const hasAtLeastOneSegment = usedSegmentIds.size > 0;
  // "else" slot requires a purpose string for each segment placed in it
  const elseSegIds = skeletonState['else'] || [];
  const allElsePurposesSet = elseSegIds.every(id => (purposeState[id] || '').trim().length >= 3);

  return (
    <div>
      <SectionIntro
        eyebrow="Step 3"
        title="Build your argument."
        body="Write your take first. Then drag marked pieces into the slot that fits — what you agree with, what you disagree with, or something else you want to use. AI will use this structure (and nothing else) to draft your paragraph."
        rightAction={<button onClick={onBack} style={ghostButtonStyle}>← Back to skeleton</button>}
      />

      <style>{`
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .slot-shake { animation: shake 0.4s ease; border-color: #C73E1D !important; }
        .seg-card-dragging { opacity: 0.4; }
      `}</style>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 40, marginTop: 48 }}>
        <aside style={{ position: 'sticky', top: 100, alignSelf: 'start', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#3A3A3A', margin: 0, fontWeight: 500 }}>
              {showAll ? `All segments (${segments.length})` : `Marked (${pinnedIds.size})`}
            </h3>
            <button onClick={() => setShowAll(s => !s)} style={{
              background: 'transparent', border: 'none', color: '#3A3A3A',
              fontSize: 11, cursor: 'pointer', textDecoration: 'underline',
              fontFamily: "'Geist', sans-serif",
            }}>{showAll ? 'Show only marked' : 'Show all'}</button>
          </div>

          {librarySections.map(({ section, segments: secSegs }) => (
            <div key={section.id} style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, color: '#3A3A3A', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px', fontFamily: "'Geist', sans-serif" }}>
                {section.label}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {secSegs.map(seg => {
                  const colors = TAG_COLORS[seg.primaryTag] || TAG_COLORS.Claim;
                  const used = usedSegmentIds.has(seg.id);
                  return (
                    <div key={seg.id} draggable
                      onDragStart={() => setDraggedSeg(seg)}
                      onDragEnd={() => setDraggedSeg(null)}
                      className={draggedSeg?.id === seg.id ? 'seg-card-dragging' : ''}
                      style={{
                        background: used ? '#F2EDE2' : '#FFFFFF',
                        border: '1px solid #EAE4D8',
                        borderLeft: `3px solid ${colors.border}`,
                        padding: '8px 10px', borderRadius: 3,
                        cursor: 'grab', opacity: used ? 0.55 : 1,
                        userSelect: 'none', transition: 'all 0.15s ease',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{
                          background: colors.bg, border: `1px solid ${colors.border}`,
                          color: colors.text, padding: '1px 6px', borderRadius: 2,
                          fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600,
                        }}>{seg.primaryTag}</span>
                        {used && <span style={{ fontSize: 9, color: '#3A3A3A' }}>used</span>}
                      </div>
                      <p style={{ fontSize: 12, lineHeight: 1.4, margin: 0, fontFamily: "'Fraunces', serif" }}>
                        {seg.text.length > 90 ? seg.text.slice(0, 90) + '…' : seg.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {librarySections.length === 0 && (
            <p style={{ fontSize: 12, color: '#3A3A3A', fontStyle: 'italic', fontFamily: "'Fraunces', serif" }}>
              {pinnedIds.size === 0 ? 'No marked segments. Go back to Step 2 to mark some, or click "Show all" above.' : 'No segments in library.'}
            </p>
          )}
        </aside>

        <div>
          {/* Both free-text fields at the top: take is required, voice is optional */}
          <div style={{ marginBottom: 16 }}>
            <FreeTextField
              field={FREE_TEXT_FIELDS[0]}
              value={freeTexts.position || ''}
              onChange={(v) => onUpdateFreeText('position', v)}
              emphasized
            />
          </div>
          <div style={{ marginBottom: 32 }}>
            <FreeTextField
              field={FREE_TEXT_FIELDS[1]}
              value={freeTexts.voice || ''}
              onChange={(v) => onUpdateFreeText('voice', v)}
            />
          </div>

          {SLOTS.map(slot => {
            const segIds = skeletonState[slot.id] || [];
            const isShaking = shakeSlot === slot.id;
            const slotAccent = slot.stance === 'agree' ? '#4F8A4F'
                             : slot.stance === 'disagree' ? '#C45656'
                             : '#9C8A6E';
            return (
              <div key={slot.id}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop(slot.id, slot.accepts)}
                className={isShaking ? 'slot-shake' : ''}
                style={{
                  background: '#FFFFFF',
                  border: '1px dashed #D6CFC0',
                  borderLeft: `4px solid ${slotAccent}`,
                  borderRadius: 4,
                  padding: '20px 24px', marginBottom: 16, minHeight: 100,
                  transition: 'border-color 0.2s ease',
                }}>
                <div style={{ marginBottom: 6 }}>
                  <h4 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 18, margin: 0, letterSpacing: '-0.01em', color: '#1A1A1A' }}>{slot.label}</h4>
                </div>
                <p style={{ fontSize: 13, color: '#1A1A1A', margin: '0 0 14px', fontFamily: "'Fraunces', serif", opacity: 0.75 }}>{slot.instruction}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {segIds.length === 0 ? (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#5A5A5A', fontSize: 12, fontStyle: 'italic', fontFamily: "'Fraunces', serif" }}>
                      Drop a segment here
                    </div>
                  ) : (
                    segIds.map(segId => {
                      const seg = segments.find(s => s.id === segId);
                      if (!seg) return null;
                      const colors = TAG_COLORS[seg.primaryTag] || TAG_COLORS.Claim;
                      const purpose = purposeState[segId] || '';
                      return (
                        <div key={segId} style={{
                          background: '#FAF8F4',
                          border: `1px solid ${colors.border}`,
                          borderLeft: `3px solid ${colors.border}`,
                          padding: '12px 14px', borderRadius: 3,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                            <div style={{ flex: 1 }}>
                              <span style={{
                                background: colors.bg, color: colors.text,
                                padding: '2px 7px', borderRadius: 2, marginRight: 8,
                                fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
                              }}>{seg.primaryTag}</span>
                              <span style={{ fontSize: 14, fontFamily: "'Fraunces', serif", lineHeight: 1.55, color: '#1A1A1A' }}>{seg.text}</span>
                            </div>
                            <button onClick={() => onRemoveSegment(slot.id, segId)} style={{
                              background: 'transparent', border: 'none', color: '#1A1A1A',
                              cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, fontWeight: 600,
                            }} title="Remove">×</button>
                          </div>
                          {slot.requiresPurpose && (
                            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #EAE4D8' }}>
                              <label style={{ fontSize: 10, color: '#1A1A1A', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                                What is this for?
                              </label>
                              <input type="text"
                                placeholder="e.g., I want to borrow this phrasing / use it as context / address this gap…"
                                value={purpose}
                                onChange={e => onUpdatePurpose(segId, e.target.value)}
                                style={{
                                  width: '100%', padding: '8px 10px',
                                  border: '1px solid #D6CFC0', borderRadius: 2,
                                  fontFamily: "'Fraunces', serif", fontSize: 13,
                                  background: '#FFFFFF', outline: 'none', color: '#1A1A1A',
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}

          <ContinueRow
            onClick={onContinue}
            label="Begin drafting →"
            disabled={!positionFilled || !hasAtLeastOneSegment || !allElsePurposesSet}
            disabledMsg={
              !positionFilled ? 'Write your take before drafting.'
                : !hasAtLeastOneSegment ? 'Add at least one segment to a slot.'
                  : !allElsePurposesSet ? 'In "Something else", briefly describe what each segment is for.'
                    : ''
            }
          />
        </div>
      </div>
    </div>
  );
}

function FreeTextField({ field, value, onChange, emphasized }) {
  return (
    <div style={{
      background: emphasized ? '#FFF8E8' : '#FFFFFF',
      border: emphasized ? '1px solid #C9B68A' : '1px solid #EAE4D8',
      borderLeft: emphasized ? '3px solid #C73E1D' : '1px solid #EAE4D8',
      borderRadius: 4, padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <h4 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 17, margin: 0, letterSpacing: '-0.01em' }}>
          {field.label}{field.optional && <span style={{ fontSize: 12, fontWeight: 400, color: '#3A3A3A', marginLeft: 8, fontStyle: 'italic' }}>optional</span>}
        </h4>
        <span style={{ fontSize: 10, color: '#3A3A3A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>You write this · no AI</span>
      </div>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={field.placeholder}
        rows={3} autoComplete="off" spellCheck={false}
        style={{ width: '100%', border: 'none', outline: 'none', fontFamily: "'Fraunces', serif", fontSize: 16, lineHeight: 1.55, background: 'transparent', resize: 'vertical', padding: '8px 0 0', color: '#1A1A1A' }}
      />
    </div>
  );
}

// ================================================================
// STAGE 4: DRAFT
// ================================================================
function computeDiff(baseline, current) {
  if (!baseline) return [{ type: 'added', text: current }];
  const a = baseline.split(/(\s+)/);
  const b = current.split(/(\s+)/);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
    else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
  }
  const result = []; let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) { result.unshift({ type: 'unchanged', text: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] >= dp[i][j - 1]) { result.unshift({ type: 'deleted', text: a[i - 1] }); i--; }
    else { result.unshift({ type: 'added', text: b[j - 1] }); j--; }
  }
  while (i > 0) { result.unshift({ type: 'deleted', text: a[i - 1] }); i--; }
  while (j > 0) { result.unshift({ type: 'added', text: b[j - 1] }); j--; }
  return result;
}

function DraftView({ segments, skeletonState, purposeState, freeTexts, draft, setDraft, aiBaseline, setAiBaseline, hasGeneratedDraft, setHasGeneratedDraft, showDriftWarning, dismissDrift, aiBusy, setAiBusy, generationError, setGenerationError, onBack }) {
  const [showDiffView, setShowDiffView] = useState(false);

  const buildPrompt = () => {
    const slotInfo = SLOTS.map(slot => {
      const segIds = skeletonState[slot.id] || [];
      if (segIds.length === 0) return null;
      const lines = segIds.map(id => {
        const seg = segments.find(s => s.id === id);
        const purpose = purposeState[id] || '';
        const purposeSuffix = slot.requiresPurpose && purpose ? ` [purpose: ${purpose}]` : '';
        return `  - (tagged ${seg.primaryTag})${purposeSuffix}: "${seg.text}"`;
      }).join('\n');
      return `${slot.label}:\n${lines}`;
    }).filter(Boolean).join('\n\n');

    const voiceLine = freeTexts.voice ? `\nTone/voice the writer wants: ${freeTexts.voice}` : '';

    return `You are stitching together a paragraph of academic prose from materials a novice writer has explicitly selected. You CANNOT introduce new claims, new evidence, new framings, or new arguments. You can ONLY use:
- The writer's take (their own argument/stance)
- The text of the segments they selected from the source
- The stance implied by which slot each segment is in (agree / disagree / something else)
- The writer's purpose notes for any "something else" segments

CONNECTOR MAPPING — use this to choose phrasing:
- Segments in "What I agree with" → use supportive connectors: "as the source argues...", "this view rightly holds that...", "consistent with this...", "as X observes..."
- Segments in "What I disagree with" → use contrastive connectors: "against this view...", "yet this overlooks...", "this fails to account for...", "however, the source's claim that..."
- Segments in "Something else I want to use" → use the writer's purpose note to guide phrasing (e.g., if purpose is "context", treat as background; if "extend", build on it)

If the writer's structure is incomplete or contradictory, write the paragraph in a way that surfaces the gap rather than papering over it. Length: 150-220 words, one paragraph.

Writer's take: ${freeTexts.position}${voiceLine}

Structure:
${slotInfo}

Return ONLY the paragraph text. No preamble, no quotation marks, no headings.`;
  };

  const generateDraft = async () => {
    setAiBusy(true); setGenerationError(null);
    try {
      const response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [{ role: 'user', content: buildPrompt() }],
          max_tokens: 1000, temperature: 0.5,
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty response');
      const cleaned = text.trim();
      setAiBaseline(cleaned); setDraft(cleaned); setHasGeneratedDraft(true);
    } catch (err) {
      console.error('Generation failed:', err);
      setGenerationError(err.message || 'Generation failed.');
    } finally { setAiBusy(false); }
  };

  const useMockDraft = () => {
    const segIds = Object.values(skeletonState).flat();
    const first = segIds.length > 0 ? segments.find(s => s.id === segIds[0])?.text || '' : '';
    const mock = `${freeTexts.position} The source provides relevant material for this argument: ${first.slice(0, 150)}${first.length > 150 ? '…' : ''} Building on this, the analysis here treats these elements as starting points for further inquiry. The relations declared above guide how each piece is taken up — supporting material woven into the central claim, points of divergence flagged where appropriate. This paragraph is a placeholder generated locally; in production, AI would render the structure with greater fluency.`;
    setAiBaseline(mock); setDraft(mock); setHasGeneratedDraft(true); setGenerationError(null);
  };

  const diffStats = useMemo(() => {
    if (!aiBaseline || !draft) return null;
    const diff = computeDiff(aiBaseline, draft);
    const baseChars = aiBaseline.length;
    let unchanged = 0, added = 0, deleted = 0;
    diff.forEach(d => {
      if (d.type === 'unchanged') unchanged += d.text.length;
      else if (d.type === 'added') added += d.text.length;
      else if (d.type === 'deleted') deleted += d.text.length;
    });
    return { aiRemaining: baseChars > 0 ? Math.round((unchanged / baseChars) * 100) : 0, addedChars: added, deletedChars: deleted, diff };
  }, [aiBaseline, draft]);

  if (!hasGeneratedDraft) {
    return (
      <div>
        <SectionIntro
          eyebrow="Step 4"
          title="Draft."
          body="AI can now stitch your selected segments and your position into a first draft — using only what you specified."
          rightAction={<button onClick={onBack} style={ghostButtonStyle}>← Back to Build</button>}
        />
        <div style={{ marginTop: 56, background: '#FFFFFF', border: '1px solid #EAE4D8', borderRadius: 4, padding: '56px 48px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#3A3A3A', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 20px' }}>Ready to draft</p>
          <h3 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 32, letterSpacing: '-0.02em', margin: '0 auto 18px', maxWidth: 560, lineHeight: 1.2 }}>
            Let AI render your structure into prose.
          </h3>
          <p style={{ fontSize: 15, color: '#1A1A1A', maxWidth: 540, margin: '0 auto 36px', lineHeight: 1.6, fontFamily: "'Fraunces', serif", fontWeight: 300 }}>
            AI will use only the segments you selected and the relations you declared. Edit freely once generated — the system will visualize what came from AI versus what you wrote yourself.
          </p>
          <button onClick={generateDraft} disabled={aiBusy} style={{
            background: '#1A1A1A', color: '#FAF8F4', border: 'none', padding: '14px 32px', fontSize: 14,
            fontFamily: "'Geist', sans-serif", fontWeight: 500,
            cursor: aiBusy ? 'wait' : 'pointer', borderRadius: 2, letterSpacing: '0.02em', opacity: aiBusy ? 0.7 : 1,
          }}>{aiBusy ? 'Generating…' : 'Generate first draft'}</button>
          {generationError && (
            <div style={{ marginTop: 32, padding: '16px 20px', background: '#FFF0EC', border: '1px solid #C73E1D', borderRadius: 3, textAlign: 'left', maxWidth: 540, marginLeft: 'auto', marginRight: 'auto' }}>
              <p style={{ fontSize: 12, color: '#C73E1D', margin: '0 0 8px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>Generation failed</p>
              <p style={{ fontSize: 13, color: '#1A1A1A', margin: '0 0 12px', lineHeight: 1.5, fontFamily: "'Fraunces', serif" }}>{generationError}</p>
              <button onClick={useMockDraft} style={{ background: '#1A1A1A', color: '#FAF8F4', border: 'none', padding: '8px 16px', fontSize: 12, cursor: 'pointer', borderRadius: 2, fontFamily: "'Geist', sans-serif", letterSpacing: '0.02em' }}>Use a mock draft</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionIntro
        eyebrow="Step 4"
        title="Edit your draft."
        body="The text below started as AI-stitched prose from your structure. Edit freely — the system tracks what's still AI and what's yours."
        rightAction={<button onClick={onBack} style={ghostButtonStyle}>← Back to Build</button>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, marginTop: 48 }}>
        <div>
          <div style={{
            background: '#FFF8E8', border: '1px solid #C9B68A', borderLeft: '3px solid #C73E1D',
            padding: '8px 14px', marginBottom: 16, borderRadius: 3,
            display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 10, color: '#3A3A3A', letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}>Your take</span>
            <span style={{ fontSize: 14, fontFamily: "'Fraunces', serif", lineHeight: 1.5, color: '#1A1A1A' }}>{freeTexts.position}</span>
          </div>

          {showDriftWarning && (
            <div style={{ background: '#FFF0EC', border: '1px solid #C73E1D', borderRadius: 3, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#C73E1D', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 500, flex: 1 }}>
                Possible drift — your draft may be moving away from your stated position. Has your thinking changed?
              </span>
              <button onClick={dismissDrift} style={{ background: 'transparent', border: 'none', color: '#C73E1D', cursor: 'pointer', fontSize: 12 }}>dismiss</button>
            </div>
          )}

          {aiBaseline && (
            <div style={{ display: 'flex', gap: 0, marginBottom: 12, borderBottom: '1px solid #EAE4D8' }}>
              <button onClick={() => setShowDiffView(false)} style={{
                background: 'transparent', border: 'none', padding: '10px 18px', fontSize: 12, cursor: 'pointer',
                fontFamily: "'Geist', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase',
                color: !showDiffView ? '#1A1A1A' : '#3A3A3A',
                borderBottom: !showDiffView ? '2px solid #1A1A1A' : '2px solid transparent', marginBottom: -1,
              }}>Edit</button>
              <button onClick={() => setShowDiffView(true)} style={{
                background: 'transparent', border: 'none', padding: '10px 18px', fontSize: 12, cursor: 'pointer',
                fontFamily: "'Geist', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase',
                color: showDiffView ? '#1A1A1A' : '#3A3A3A',
                borderBottom: showDiffView ? '2px solid #1A1A1A' : '2px solid transparent', marginBottom: -1,
              }}>Diff view</button>
            </div>
          )}

          <div style={{ background: '#FFFFFF', border: '1px solid #EAE4D8', borderRadius: 4 }}>
            {showDiffView && diffStats ? (
              <div style={{
                padding: '48px 56px', minHeight: 420,
                fontFamily: "'Fraunces', serif", fontSize: 18, lineHeight: 1.8,
                color: '#1A1A1A', textIndent: '1.5em', textAlign: 'justify',
                maxWidth: 680,
              }}>
                {diffStats.diff.map((d, i) => {
                  if (d.type === 'unchanged') return <span key={i} style={{ background: '#F2EDE2' }}>{d.text}</span>;
                  if (d.type === 'added') return <span key={i} style={{ background: '#E8F0DD', borderBottom: '2px solid #739050' }}>{d.text}</span>;
                  if (d.type === 'deleted') return <span key={i} style={{ background: '#FAE0DD', textDecoration: 'line-through', color: '#3A3A3A' }}>{d.text}</span>;
                  return null;
                })}
              </div>
            ) : (
              <textarea value={draft} onChange={e => setDraft(e.target.value)}
                placeholder={aiBaseline ? "" : "Write your paragraph here. The AI didn't generate one this time — this draft is fully yours."}
                style={{
                  width: '100%', minHeight: 420, border: 'none', outline: 'none',
                  padding: '48px 56px',
                  fontFamily: "'Fraunces', serif", fontSize: 18, lineHeight: 1.8,
                  background: 'transparent', resize: 'vertical', color: '#1A1A1A',
                  textIndent: draft ? '1.5em' : 0,
                  boxSizing: 'border-box',
                }}
                autoComplete="off" spellCheck={false} />
            )}
          </div>

          {aiBaseline && showDiffView && (
            <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, color: '#3A3A3A', fontFamily: "'Geist', sans-serif", flexWrap: 'wrap' }}>
              <span><span style={{ background: '#F2EDE2', padding: '2px 6px' }}>beige</span> = AI baseline preserved</span>
              <span><span style={{ background: '#E8F0DD', padding: '2px 6px' }}>green</span> = your additions</span>
              <span><span style={{ background: '#FAE0DD', padding: '2px 6px', textDecoration: 'line-through' }}>red</span> = removed from AI</span>
            </div>
          )}
        </div>

        <aside style={{ position: 'sticky', top: 100, alignSelf: 'start' }}>
          {aiBaseline && diffStats && (
            <>
              <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#3A3A3A', margin: '0 0 16px', fontWeight: 500 }}>Authorship trace</h3>
              <div style={{ background: '#FFFFFF', border: '1px solid #EAE4D8', borderRadius: 3, padding: '16px 18px', marginBottom: 24 }}>
                <Stat label="AI baseline retained" value={`${diffStats.aiRemaining}%`} />
                <Stat label="Your additions" value={`${diffStats.addedChars} chars`} />
                <Stat label="Removed from AI" value={`${diffStats.deletedChars} chars`} />
              </div>
            </>
          )}
          <h3 style={{ fontFamily: "'Geist', sans-serif", fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#3A3A3A', margin: '0 0 12px', fontWeight: 500 }}>Your structure</h3>
          <div style={{ fontSize: 12, color: '#1A1A1A', fontFamily: "'Fraunces', serif", lineHeight: 1.5 }}>
            {SLOTS.map(slot => {
              const ids = skeletonState[slot.id] || [];
              if (ids.length === 0) return null;
              const slotAccent = slot.stance === 'agree' ? '#4F8A4F'
                               : slot.stance === 'disagree' ? '#C45656'
                               : '#9C8A6E';
              return (
                <div key={slot.id} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: slotAccent, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>
                    {slot.label}
                  </div>
                  {ids.map(id => {
                    const seg = segments.find(s => s.id === id);
                    if (!seg) return null;
                    const preview = seg.text.split(/\s+/).slice(0, 6).join(' ');
                    const truncated = seg.text.split(/\s+/).length > 6;
                    return (
                      <div key={id} style={{
                        fontSize: 11, color: '#1A1A1A', lineHeight: 1.45,
                        paddingLeft: 8, borderLeft: `2px solid ${slotAccent}`,
                        marginBottom: 4, fontStyle: 'italic',
                      }}>
                        "{preview}{truncated ? '…' : ''}"
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {Object.values(skeletonState).every(arr => !arr || arr.length === 0) && (
              <div style={{ fontSize: 11, color: '#5A5A5A', fontStyle: 'italic' }}>No segments placed.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid #F2EDE2' }}>
      <span style={{ fontSize: 11, color: '#3A3A3A', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 14, fontFamily: "'Fraunces', serif", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

// ================================================================
// SHARED
// ================================================================
function SectionIntro({ eyebrow, title, body, rightAction }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 640 }}>
        <p style={{ fontSize: 11, color: '#3A3A3A', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 12px' }}>{eyebrow}</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 'clamp(28px, 4vw, 44px)', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 18px' }}>{title}</h2>
        <p style={{ fontSize: 16, color: '#1A1A1A', lineHeight: 1.6, margin: 0, fontFamily: "'Fraunces', serif", fontWeight: 300 }}>{body}</p>
      </div>
      {rightAction}
    </div>
  );
}

function ContinueRow({ onClick, label, disabled, disabledMsg }) {
  return (
    <div style={{ marginTop: 56, paddingTop: 32, borderTop: '1px solid #EAE4D8', textAlign: 'right' }}>
      {disabled && disabledMsg && (
        <p style={{ fontSize: 13, color: '#C73E1D', margin: '0 0 12px', fontStyle: 'italic', fontFamily: "'Fraunces', serif" }}>{disabledMsg}</p>
      )}
      <button onClick={onClick} disabled={disabled} style={{
        background: disabled ? '#D6CFC0' : '#1A1A1A',
        color: '#FAF8F4', border: 'none', padding: '14px 28px',
        fontSize: 14, fontFamily: "'Geist', sans-serif", fontWeight: 500,
        borderRadius: 2, cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: '0.02em',
      }}>{label}</button>
    </div>
  );
}

const ghostButtonStyle = {
  background: 'transparent', border: '1px solid #D6CFC0', color: '#1A1A1A',
  padding: '10px 18px', fontSize: 12, fontFamily: "'Geist', sans-serif",
  fontWeight: 500, borderRadius: 2, cursor: 'pointer', letterSpacing: '0.02em',
};

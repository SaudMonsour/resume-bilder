'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ResumeVersion } from '@/lib/domain/schema';
import { FORMATS, resumeBlocks } from '@/lib/export/resume-document';

export function ResumePreview({ resume }: { resume: ResumeVersion }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / ((resume.paperSize === 'Letter' ? 612 : 595.45) * 96 / 72))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [resume.paperSize]);
  return <div ref={viewport} className="w-full"><article id="resume-print" style={{ zoom: scale }} className={`resume-page mx-auto bg-white text-black shadow-[0_24px_70px_rgb(15_23_42/12%)] ${resume.paperSize === 'Letter' ? 'resume-letter' : ''}`}>
    {resumeBlocks(resume).map((block, index) => {
      const format = FORMATS[block.role];
      const Element = block.role === 'name' ? 'h1' : block.role === 'heading' ? 'h2' : 'p';
      const style: CSSProperties = { fontSize: `${format.size}pt`, marginTop: `${format.before}pt`, marginBottom: `${format.after}pt`, lineHeight: format.line * 1.22, fontWeight: format.bold ? 700 : 400, fontStyle: format.italic ? 'italic' : undefined, letterSpacing: format.tracking ? `${format.tracking}pt` : undefined, breakAfter: format.keepNext ? 'avoid' : undefined };
      return <Element key={index} style={style} className={`resume-block resume-${block.role}`}>
        {block.role === 'bullet' && <span className="resume-bullet-marker" aria-hidden="true">•</span>}
        <span className="resume-block-content">{block.runs.map((run, i) => {
          const runStyle: CSSProperties = { fontWeight: run.bold === undefined ? undefined : run.bold ? 700 : 400, fontStyle: run.italic ? 'italic' : undefined, fontSize: run.size ? `${run.size}pt` : undefined };
          return run.href ? <a key={i} href={run.href} target="_blank" rel="noreferrer" style={runStyle}>{run.text}</a> : <span key={i} style={runStyle}>{run.text}</span>;
        })}</span>
        {block.right && <span className="resume-entry-date">{block.right}</span>}
      </Element>;
    })}
  </article></div>;
}

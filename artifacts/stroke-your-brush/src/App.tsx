import { useCallback, useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Link, Route, Switch, useLocation } from 'wouter';
import { ArrowUpRight, Brush, ChevronLeft, Circle, Copy, Download, FileDown, FileUp, Film, Layers3, Pause, Pencil, Play, Plus, Redo2, Save, Sparkles, Trash2, Undo2, Volume2, VolumeX, WandSparkles, ZoomIn, ZoomOut } from 'lucide-react';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; size: number; brush: BrushKind };
type BrushKind = 'ink' | 'pencil' | 'marker' | 'sprout' | 'dotted' | 'spring' | 'neon' | 'rainbow' | 'clean' | 'soft' | 'pixel';
type ToolKind = 'brush' | 'eraser' | 'lasso';
type CanvasBackground = { name: string; color: string; pattern: 'solid' | 'grid' | 'gradient' };

const queryClient = new QueryClient();
const palette = ['#172f2b', '#ef5b67', '#f49c57', '#f4cf6b', '#5c8c82', '#8c6fb1', '#f6eee0'];
const backgrounds: CanvasBackground[] = [
  { name: 'Paper', color: '#fdf7e9', pattern: 'solid' },
  { name: 'Oat grid', color: '#eee7d6', pattern: 'grid' },
  { name: 'Mint wash', color: '#e6f0e7', pattern: 'gradient' },
  { name: 'Blush', color: '#f5e4df', pattern: 'solid' },
  { name: 'Night grid', color: '#203735', pattern: 'grid' },
];
const brushes: { id: BrushKind; label: string; sub: string }[] = [
  { id: 'ink', label: 'Loose ink', sub: 'wobbly + honest' },
  { id: 'pencil', label: 'Soft pencil', sub: 'quiet grain' },
  { id: 'marker', label: 'Round marker', sub: 'big feeling' },
  { id: 'sprout', label: 'Sprout', sub: 'little tendrils' },
  { id: 'dotted', label: 'Dotted trail', sub: 'skip + sparkle' },
  { id: 'spring', label: 'Spring line', sub: 'bouncy energy' },
  { id: 'neon', label: 'Neon glow', sub: 'light after dark' },
  { id: 'rainbow', label: 'Rainbow ribbon', sub: 'color in motion' },
];
const frameBrushes: { id: BrushKind; label: string; sub: string }[] = [
  { id: 'clean', label: 'Clean pen', sub: 'steady + clear' },
  { id: 'soft', label: 'Soft pencil', sub: 'smooth + quiet' },
  { id: 'pixel', label: 'Pixel trail', sub: 'crisp + dotted' },
  { id: 'marker', label: 'Flat marker', sub: 'solid + simple' },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function IconButton({ label, onClick, children, disabled = false, active = false }: { label: string; onClick: () => void; children: ReactNode; disabled?: boolean; active?: boolean }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`press flex h-9 w-9 items-center justify-center rounded-lg border ${active ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--card))]'} disabled:cursor-not-allowed disabled:opacity-30`}>{children}</button>;
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects = currentPoint.y > point.y !== previousPoint.y > point.y
      && point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function strokeIsInside(stroke: Stroke, polygon: Point[]) {
  return stroke.points.some((point) => pointInPolygon(point, polygon));
}

function playBrushSound(brush: BrushKind) {
  if (typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies: Record<BrushKind, number> = { ink: 210, pencil: 130, marker: 175, sprout: 330, dotted: 490, spring: 270, neon: 620, rainbow: 380, clean: 190, soft: 120, pixel: 430 };
  oscillator.type = brush === 'neon' ? 'sine' : brush === 'pencil' ? 'triangle' : 'square';
  oscillator.frequency.value = frequencies[brush];
  gain.gain.setValueAtTime(0.035, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.09);
  window.setTimeout(() => void context.close(), 140);
}

function Logo() {
  return <Link href="/" aria-label="StrokeYourBrush home" className="group flex items-center gap-2.5">
    <span className="relative flex h-9 w-9 rotate-[-7deg] items-center justify-center rounded-[11px] bg-[hsl(var(--primary))] text-[hsl(var(--secondary))] shadow-[3px_3px_0_hsl(var(--accent))] transition-transform group-hover:rotate-3"><Brush size={19} strokeWidth={2.3} /></span>
    <span className="text-[15px] font-700 tracking-[-.03em]">Stroke<span className="text-[hsl(var(--accent))]">Your</span>Brush</span>
  </Link>;
}

function TopBar({ mode }: { mode?: 'draw' | 'animate' }) {
  const [, navigate] = useLocation();
  return <header className="flex min-h-[68px] items-center justify-between gap-4 border-b border-[hsl(var(--border)/.8)] px-5 py-3 md:px-8">
    <Logo />
    <nav className="flex items-center gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.65)] p-1" aria-label="Main navigation">
      <Link href="/draw" className={`rounded-lg px-3 py-1.5 text-[12px] font-600 ${mode === 'draw' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>Draw</Link>
      <Link href="/animate" className={`rounded-lg px-3 py-1.5 text-[12px] font-600 ${mode === 'animate' ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}>Animate</Link>
    </nav>
    <div className="hidden items-center gap-3 sm:flex">
      <span className="mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">local studio / v0.1</span>
      <button type="button" onClick={() => navigate('/draw')} className="press rounded-full bg-[hsl(var(--secondary))] px-4 py-2 text-[12px] font-700 text-[hsl(var(--foreground))] shadow-[2px_2px_0_hsl(var(--foreground)/.13)]">Make a mark <ArrowUpRight size={14} className="ml-1 inline" /></button>
    </div>
  </header>;
}

function Landing() {
  return <div className="grain min-h-[100dvh]">
    <TopBar />
    <main>
      <section className="mx-auto grid max-w-[1240px] items-center gap-12 px-6 pb-20 pt-16 md:grid-cols-[1.02fr_.98fr] md:px-12 md:pb-28 md:pt-24">
        <div className="appear">
          <p className="mono mb-6 text-[11px] uppercase tracking-[.24em] text-[hsl(var(--accent))]">A small studio for big scribbles</p>
          <h1 className="max-w-[680px] text-[clamp(3.3rem,8vw,7rem)] font-800 leading-[.9] tracking-[-.075em]">Make marks.<br /><span className="serif font-600 italic text-[hsl(var(--accent))]">Make them move.</span></h1>
          <p className="mt-8 max-w-[430px] text-[17px] leading-7 text-[hsl(var(--muted-foreground))]">StrokeYourBrush is the bright little corner where sketches get wiggly, ideas get a second frame, and nothing needs to be perfect.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/draw" className="press inline-flex items-center gap-2 rounded-full bg-[hsl(var(--primary))] px-6 py-3.5 text-[14px] font-700 text-[hsl(var(--primary-foreground))] shadow-[4px_4px_0_hsl(var(--accent))]">Open the sketchbook <ArrowUpRight size={17} /></Link>
            <Link href="/animate" className="press inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] px-5 py-3 text-[13px] font-600 hover:bg-[hsl(var(--card))]"><Film size={16} /> See the timeline</Link>
          </div>
          <div className="mt-12 flex items-center gap-6 text-[11px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><Circle size={9} fill="currentColor" /> Nothing leaves your browser</span><span className="flex items-center gap-2"><Sparkles size={13} /> Made for play</span></div>
        </div>
        <div className="relative appear delay-1 min-h-[430px]">
          <div className="absolute right-2 top-3 h-[370px] w-[86%] rotate-3 rounded-[28px] border border-[hsl(var(--border))] bg-[#eadfc9] shadow-[8px_10px_0_hsl(172_30%_15%/.12)] md:right-8" />
          <div className="canvas-frame absolute left-0 top-0 h-[380px] w-[91%] -rotate-2 overflow-hidden rounded-[28px] border border-[hsl(var(--border))] bg-[#fdf7e9] p-6 md:h-[410px]">
            <div className="mono flex items-center justify-between text-[9px] uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]"><span>untitled / 001</span><span>wiggle study</span></div>
            <svg viewBox="0 0 500 300" className="mt-5 h-[calc(100%-32px)] w-full overflow-visible" aria-label="An abstract colorful animated sketch">
              <path d="M63 183 C92 89 153 86 172 161 S248 236 283 130 S364 70 425 143" fill="none" stroke="#ef5b67" strokeWidth="18" strokeLinecap="round" className="wiggle" />
              <path d="M72 176 C100 104 157 110 183 164 S244 218 279 135 S360 92 418 149" fill="none" stroke="#172f2b" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 12" />
              <path d="M242 58 q-40 23 -15 51 q26 28 55 2 q30 -28 -6 -54" fill="none" stroke="#f49c57" strokeWidth="9" strokeLinecap="round" />
              <circle cx="103" cy="74" r="8" fill="#5c8c82" /><circle cx="396" cy="220" r="13" fill="#f4cf6b" />
              <path d="M130 250 q20 -34 38 0 M149 250 q22 -34 40 0" fill="none" stroke="#8c6fb1" strokeWidth="5" strokeLinecap="round" />
            </svg>
            <span className="absolute bottom-5 right-6 rotate-3 text-[12px] text-[hsl(var(--accent))]">keep going →</span>
          </div>
          <span className="absolute bottom-0 right-2 rotate-[-8deg] rounded-full bg-[hsl(var(--accent))] px-4 py-2 text-[11px] font-700 text-[hsl(var(--card))] shadow-[3px_3px_0_hsl(var(--foreground)/.16)]">the wobble is the point</span>
        </div>
      </section>
      <section className="border-y border-[hsl(var(--border)/.75)] bg-[hsl(var(--card)/.32)]">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-6 py-12 md:grid-cols-3 md:px-12">
          {[
            ['01', 'Draw without a ruler', 'A soft, responsive canvas with brushes that keep a little human wobble in every line.'],
            ['02', 'Give it a pulse', 'Duplicate a frame, change a few marks, and watch a sketch become a tiny loop.'],
            ['03', 'Take it with you', 'PNG and JSON exports are yours. Your work stays local, private, and pleasantly yours.'],
          ].map(([num, title, copy], i) => <article key={num} className={`appear delay-${i} border-l border-[hsl(var(--border))] pl-5`}><span className="mono text-[10px] text-[hsl(var(--accent))]">{num}</span><h2 className="mt-3 text-[19px] font-700 tracking-[-.03em]">{title}</h2><p className="mt-2 max-w-[290px] text-[13px] leading-5 text-[hsl(var(--muted-foreground))]">{copy}</p></article>)}
        </div>
      </section>
    </main>
    <footer className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-8 text-[11px] text-[hsl(var(--muted-foreground))] md:px-12"><span className="mono">StrokeYourBrush © locally made</span><span>For curious hands and unfinished thoughts.</span></footer>
  </div>;
}

function SketchCanvas({ strokes, background, brush, color, size, tool, selectedIndices, onSelection, onMoveSelection, onErase, onStroke, canvasRef, onionStrokes = [], zoom = 100, wiggle = true }: { strokes: Stroke[]; background: CanvasBackground; brush: BrushKind; color: string; size: number; tool: ToolKind; selectedIndices: number[]; onSelection: (indices: number[]) => void; onMoveSelection: (delta: Point) => void; onErase: (index: number) => void; onStroke: (stroke: Stroke) => void; canvasRef: RefObject<HTMLCanvasElement | null>; onionStrokes?: Stroke[]; zoom?: number; wiggle?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const currentRef = useRef<Point[]>([]);
  const movingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const [pulse, setPulse] = useState(0);
  const drawScene = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const logicalW = Math.max(300, rect.width);
    const logicalH = Math.max(260, rect.height);
    if (canvas.width !== logicalW * dpr || canvas.height !== logicalH * dpr) { canvas.width = logicalW * dpr; canvas.height = logicalH * dpr; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, logicalW, logicalH);
    if (background.pattern === 'gradient') {
      const gradient = ctx.createLinearGradient(0, 0, logicalW, logicalH);
      gradient.addColorStop(0, background.color);
      gradient.addColorStop(1, '#fffaf0');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, logicalW, logicalH);
    } else {
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, logicalW, logicalH);
    }
    if (background.pattern === 'grid') {
      ctx.save();
      ctx.globalAlpha = background.color === '#203735' ? 0.16 : 0.24;
      ctx.strokeStyle = background.color === '#203735' ? '#fdf7e9' : '#172f2b';
      ctx.lineWidth = 1;
      for (let x = 0; x < logicalW; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, logicalH); ctx.stroke(); }
      for (let y = 0; y < logicalH; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(logicalW, y); ctx.stroke(); }
      ctx.restore();
    }
    const paint = (items: Stroke[], alpha = 1, offset = 0) => items.forEach((stroke, strokeIndex) => {
      if (stroke.points.length < 1) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (stroke.brush === 'rainbow') {
        const gradient = ctx.createLinearGradient(0, 0, logicalW, logicalH);
        gradient.addColorStop(0, '#ef5b67');
        gradient.addColorStop(.35, '#f4cf6b');
        gradient.addColorStop(.68, '#5c8c82');
        gradient.addColorStop(1, '#8c6fb1');
        ctx.strokeStyle = gradient;
      } else {
        ctx.strokeStyle = stroke.color;
      }
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash(stroke.brush === 'pencil' || stroke.brush === 'soft' ? [1, 3] : stroke.brush === 'sprout' ? [1, 8] : stroke.brush === 'dotted' || stroke.brush === 'pixel' ? [2, 8] : []);
      ctx.lineCap = stroke.brush === 'pixel' ? 'butt' : 'round';
      if (stroke.brush === 'neon') {
        ctx.shadowColor = stroke.color;
        ctx.shadowBlur = Math.max(8, stroke.size * 1.5);
      }
      ctx.beginPath();
      stroke.points.forEach((point, pointIndex) => {
        const wobble = wiggle && (stroke.brush === 'ink' || stroke.brush === 'sprout' || stroke.brush === 'spring')
          ? Math.sin(pulse * (stroke.brush === 'spring' ? .09 : .045) + pointIndex * 1.7 + strokeIndex) * (stroke.brush === 'spring' ? 3.3 : stroke.size > 8 ? .7 : 1.7)
          : wiggle && stroke.brush === 'neon' ? Math.sin(pulse * .07 + pointIndex) * 1.1 : 0;
        const x = point.x + wobble + offset;
        const y = point.y + (wiggle ? Math.cos(pulse * (stroke.brush === 'spring' ? .065 : .035) + pointIndex) * (stroke.brush === 'sprout' ? 1.4 : stroke.brush === 'spring' ? 2 : .35) : 0);
        pointIndex === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      if (stroke.brush === 'sprout' && stroke.points.length > 4) {
        const end = stroke.points[stroke.points.length - 1];
        ctx.setLineDash([]);
        ctx.lineWidth = Math.max(1, stroke.size * .32);
        ctx.beginPath(); ctx.arc(end.x, end.y, stroke.size * .7, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    });
    paint(onionStrokes, .15, 4);
    paint(strokes);
    if (tool === 'brush' && currentRef.current.length) {
      paint([{ points: currentRef.current, color, size, brush }], .92);
    }
    if (selectedIndices.length) {
      ctx.save();
      ctx.strokeStyle = '#ef5b67';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      selectedIndices.forEach((index) => {
        const stroke = strokes[index];
        if (!stroke || !stroke.points.length) return;
        const xs = stroke.points.map((point) => point.x);
        const ys = stroke.points.map((point) => point.y);
        const minX = Math.min(...xs) - stroke.size;
        const minY = Math.min(...ys) - stroke.size;
        const maxX = Math.max(...xs) + stroke.size;
        const maxY = Math.max(...ys) + stroke.size;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      });
      ctx.restore();
    }
  }, [background, brush, canvasRef, color, onionStrokes, pulse, size, strokes, tool, wiggle]);
  useEffect(() => {
    drawScene();
    const observer = new ResizeObserver(drawScene);
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [drawScene]);
  useEffect(() => {
    let frame = 0;
    const animate = () => { setPulse((value) => value + 1); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);
  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / (zoom / 100), y: (event.clientY - rect.top) / (zoom / 100) };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    lastPointRef.current = point;
    if (tool === 'lasso' && selectedIndices.length && selectedIndices.some((index) => strokes[index]?.points.some((strokePoint) => Math.hypot(strokePoint.x - point.x, strokePoint.y - point.y) < 28))) {
      movingRef.current = true;
      return;
    }
    drawingRef.current = true;
    currentRef.current = [point];
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current && !movingRef.current) return;
    const point = pointFromEvent(event);
    if (movingRef.current && lastPointRef.current) {
      onMoveSelection({ x: point.x - lastPointRef.current.x, y: point.y - lastPointRef.current.y });
      lastPointRef.current = point;
      return;
    }
    const previous = currentRef.current[currentRef.current.length - 1] || point;
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / 4));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      currentRef.current.push({ x: previous.x + (point.x - previous.x) * progress, y: previous.y + (point.y - previous.y) * progress });
    }
    lastPointRef.current = point;
    if (tool === 'eraser') {
      const hitIndex = strokes.findIndex((stroke) => stroke.points.some((strokePoint) => Math.hypot(strokePoint.x - point.x, strokePoint.y - point.y) < Math.max(12, size * 1.6)));
      if (hitIndex >= 0) onErase(hitIndex);
    }
  };
  const pointerUp = () => {
    if (movingRef.current) {
      movingRef.current = false;
      lastPointRef.current = null;
      return;
    }
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (tool === 'lasso') onSelection(strokes.map((stroke, index) => strokeIsInside(stroke, currentRef.current) ? index : -1).filter((index) => index >= 0));
    if (tool === 'brush' && currentRef.current.length > 1) onStroke({ points: currentRef.current, color, size, brush });
    currentRef.current = [];
    lastPointRef.current = null;
  };
  return <div ref={wrapRef} className="canvas-frame relative h-full min-h-[360px] w-full overflow-hidden rounded-[18px] border border-[hsl(var(--border))]" style={{ background: background.color }}>
    <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full touch-none ${tool === 'lasso' ? 'cursor-crosshair' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'}`} style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center' }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="Drawing canvas" />
    {strokes.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="text-center text-[hsl(var(--muted-foreground)/.65)]"><Pencil className="mx-auto mb-3" size={25} strokeWidth={1.4} /><p className="text-[13px]">start somewhere soft</p><p className="mono mt-1 text-[9px] uppercase tracking-[.15em]">your first mark is allowed to be strange</p></div></div>}
    <span className="pointer-events-none absolute bottom-3 right-4 mono text-[9px] uppercase tracking-[.16em] text-[hsl(var(--foreground)/.35)]">{background.name} / {Math.round(zoom)}%</span>
  </div>;
}

function hsvToHex(hue: number, saturation: number, value: number) {
  const f = (n: number, k = (n + hue / 60) % 6) => value - value * saturation * Math.max(Math.min(k, 4 - k, 1), 0);
  return `#${[f(5), f(3), f(1)].map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHsv(hex: string) {
  const normalized = hex.replace('#', '');
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max };
}

function ColorWheel({ color, setColor }: { color: string; setColor: (value: string) => void }) {
  const initial = hexToHsv(color);
  const [hue, setHue] = useState(initial.hue);
  const [saturation, setSaturation] = useState(initial.saturation);
  const [value, setValue] = useState(initial.value);
  useEffect(() => {
    const next = hexToHsv(color);
    setHue(next.hue);
    setSaturation(next.saturation);
    setValue(next.value);
  }, [color]);
  const chooseHue = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180 / Math.PI + 90;
    const nextHue = (angle + 360) % 360;
    setHue(nextHue);
    setColor(hsvToHex(nextHue, saturation, value));
  };
  const chooseTone = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nextSaturation = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const nextValue = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
    setSaturation(nextSaturation);
    setValue(nextValue);
    setColor(hsvToHex(hue, nextSaturation, nextValue));
  };
  return <div className="mb-4 flex items-center gap-3">
    <div className="relative h-[86px] w-[86px] shrink-0 rounded-full bg-[conic-gradient(#ef5b67,#f49c57,#f4cf6b,#5c8c82,#4c72b0,#8c6fb1,#ef5b67)] p-[7px]" onPointerDown={chooseHue} onPointerMove={(event) => event.buttons === 1 && chooseHue(event)} aria-label="Hue ring">
      <div className="relative h-full w-full rounded-full border-[5px] border-[hsl(var(--card))] bg-[hsl(var(--muted))]">
        <div className="absolute inset-[11px] rounded-full border border-[hsl(var(--border))]" style={{ background: color }} />
        <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full border-2 border-[hsl(var(--card))] bg-[hsl(var(--foreground))]" style={{ transform: `rotate(${hue}deg) translateY(-34px)` }} />
      </div>
    </div>
    <div className="min-w-0 flex-1">
      <div className="relative h-[72px] w-full cursor-crosshair overflow-hidden rounded-lg border border-[hsl(var(--border))]" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))` }} onPointerDown={chooseTone} onPointerMove={(event) => event.buttons === 1 && chooseTone(event)} aria-label="Saturation and brightness">
        <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(0,0,0,.35)]" style={{ left: `${saturation * 100}%`, top: `${(1 - value) * 100}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between"><span className="mono text-[9px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">Color</span><span className="mono text-[10px]">{color.toUpperCase()}</span></div>
    </div>
  </div>;
}

function BrushPanel({ mode, brush, setBrush, color, setColor, size, setSize, background, setBackground, tool, setTool, savedPalette, addPaletteColor }: { mode: 'draw' | 'animate'; brush: BrushKind; setBrush: (value: BrushKind) => void; color: string; setColor: (value: string) => void; size: number; setSize: (value: number) => void; background: CanvasBackground; setBackground: (value: CanvasBackground) => void; tool: ToolKind; setTool: (value: ToolKind) => void; savedPalette: string[]; addPaletteColor: () => void }) {
  const availableBrushes = mode === 'animate' ? frameBrushes : brushes;
  return <aside className="w-full shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/.43)] p-4 lg:w-[215px] lg:border-b-0 lg:border-r">
    <div className="mb-6"><p className="mono mb-3 text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Tools</p><div className="grid grid-cols-3 gap-2"><button type="button" onClick={() => setTool('brush')} className={`press rounded-xl border px-2 py-2 text-[11px] ${tool === 'brush' ? 'border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]' : 'border-transparent hover:border-[hsl(var(--border))]'}`}><Brush className="mx-auto mb-1" size={15} />Brush</button><button type="button" onClick={() => setTool('eraser')} className={`press rounded-xl border px-2 py-2 text-[11px] ${tool === 'eraser' ? 'border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]' : 'border-transparent hover:border-[hsl(var(--border))]'}`}><Trash2 className="mx-auto mb-1" size={15} />Erase</button><button type="button" onClick={() => setTool('lasso')} className={`press rounded-xl border px-2 py-2 text-[11px] ${tool === 'lasso' ? 'border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]' : 'border-transparent hover:border-[hsl(var(--border))]'}`}><Pencil className="mx-auto mb-1" size={15} />Lasso</button></div></div>
     <div className="mb-6"><p className="mono mb-3 text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">{mode === 'animate' ? 'Frame brushes' : 'Brush personality'}</p><div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
       {availableBrushes.map((item) => <button type="button" key={item.id} onClick={() => setBrush(item.id)} className={`press flex items-center gap-3 rounded-xl border p-2.5 text-left ${brush === item.id ? 'border-[hsl(var(--accent)/.5)] bg-[hsl(var(--accent)/.1)]' : 'border-transparent hover:border-[hsl(var(--border))]'}`}><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--muted))]"><Brush size={15} className={item.id === 'sprout' || item.id === 'neon' || item.id === 'rainbow' ? 'text-[hsl(var(--accent))]' : ''} /></span><span><span className="block text-[12px] font-600">{item.label}</span><span className="block text-[10px] text-[hsl(var(--muted-foreground))]">{item.sub}</span></span></button>)}
    </div></div>
    <div className="mb-6"><p className="mono mb-3 text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Color wheel</p><ColorWheel color={color} setColor={setColor} /><div className="flex flex-wrap gap-2">{[...palette, ...savedPalette].map((swatch, index) => <button type="button" key={`${swatch}-${index}`} aria-label={`Choose color ${swatch}`} onClick={() => setColor(swatch)} className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${color === swatch ? 'scale-110 border-[hsl(var(--foreground))] shadow-[0_0_0_2px_hsl(var(--card))]' : 'border-transparent'}`} style={{ background: swatch }} />)}<button type="button" onClick={addPaletteColor} className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]" aria-label="Save current color to palette">+</button></div></div>
    <div className="mb-6"><div className="mb-2 flex justify-between"><p className="mono text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Weight</p><span className="mono text-[10px]">{size}px</span></div><input aria-label="Brush weight" type="range" min="2" max="34" value={size} onChange={(event) => setSize(Number(event.target.value))} className="w-full accent-[hsl(var(--accent))]" /></div>
    <div><p className="mono mb-3 text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Paper</p><div className="flex flex-wrap gap-2">{backgrounds.map((item) => <button type="button" aria-label={`Choose ${item.name} background`} key={item.name} onClick={() => setBackground(item)} className={`h-7 w-7 rounded-lg border transition-transform hover:scale-110 ${background.name === item.name ? 'border-[hsl(var(--foreground))] ring-2 ring-[hsl(var(--card))]' : 'border-[hsl(var(--border))]'}`} style={{ background: item.color }} />)}</div></div>
  </aside>;
}

function Toolbar({ mode, strokes, selectedIndices, redo, undo, setZoom, zoom, clear, exportPng, exportMotion, saveJson, loadJson, duplicateSelection, deleteSelection, soundOn, setSoundOn }: { mode: 'draw' | 'animate'; strokes: Stroke[]; selectedIndices: number[]; redo: () => void; undo: () => void; setZoom: (value: number) => void; zoom: number; clear: () => void; exportPng: () => void; exportMotion: () => void; saveJson: () => void; loadJson: () => void; duplicateSelection: () => void; deleteSelection: () => void; soundOn: boolean; setSoundOn: (value: boolean) => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--border))] px-4 py-3 md:px-6"><div className="flex items-center gap-1"><IconButton label="Undo" onClick={undo} disabled={!strokes.length}><Undo2 size={16} /></IconButton><IconButton label="Redo" onClick={redo}><Redo2 size={16} /></IconButton><span className="mx-2 h-5 w-px bg-[hsl(var(--border))]" /><IconButton label="Zoom out" onClick={() => setZoom(Math.max(60, zoom - 10))}><ZoomOut size={16} /></IconButton><button type="button" onClick={() => setZoom(100)} className="mono w-11 text-center text-[10px] hover:text-[hsl(var(--accent))]" aria-label="Reset zoom">{zoom}%</button><IconButton label="Zoom in" onClick={() => setZoom(Math.min(140, zoom + 10))}><ZoomIn size={16} /></IconButton>{selectedIndices.length > 0 && <><span className="mx-2 h-5 w-px bg-[hsl(var(--border))]" /><IconButton label="Duplicate selection" onClick={duplicateSelection}><Copy size={16} /></IconButton><IconButton label="Delete selection" onClick={deleteSelection}><Trash2 size={16} /></IconButton></>}</div><div className="flex items-center gap-1"><IconButton label={soundOn ? 'Mute brush sounds' : 'Unmute brush sounds'} onClick={() => setSoundOn(!soundOn)} active={soundOn}>{soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</IconButton><button type="button" onClick={clear} className="press hidden items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] sm:flex"><Trash2 size={14} /> Clear</button><button type="button" onClick={saveJson} className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><Save size={14} /> Save</button><button type="button" onClick={loadJson} className="press flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"><FileUp size={14} /> Load</button>{mode === 'draw' ? <button type="button" onClick={exportMotion} className="press flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-[11px]"><Film size={14} /> Motion</button> : null}<button type="button" onClick={exportPng} className="press flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-[11px] font-600 text-[hsl(var(--primary-foreground))]"><Download size={14} /> PNG</button></div></div>;
}

function Workspace({ mode }: { mode: 'draw' | 'animate' }) {
  const [, navigate] = useLocation();
  const [brush, setBrush] = useState<BrushKind>(mode === 'animate' ? 'clean' : 'ink');
  const [color, setColor] = useState(palette[0]);
  const [size, setSize] = useState(7);
  const [background, setBackground] = useState(backgrounds[0]);
  const [tool, setTool] = useState<ToolKind>('brush');
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [savedPalette, setSavedPalette] = useState<string[]>([]);
  const [soundOn, setSoundOn] = useState(true);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [history, setHistory] = useState<Stroke[][]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[][]>([]);
  const [zoom, setZoom] = useState(100);
  const [frames, setFrames] = useState<Stroke[][]>([[]]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [fps, setFps] = useState(4);
  const [onion, setOnion] = useState(true);
  const [layers, setLayers] = useState(['Sketch marks']);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const saveKey = `stroke-your-brush-${mode}`;
  useEffect(() => {
    const stored = localStorage.getItem(saveKey);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (mode === 'draw' && Array.isArray(parsed.strokes)) setStrokes(parsed.strokes);
      if (mode === 'animate' && Array.isArray(parsed.frames) && parsed.frames.length) { setFrames(parsed.frames); setStrokes(parsed.frames[0]); }
    } catch { /* old or malformed local work is safely ignored */ }
  }, [mode, saveKey]);
  useEffect(() => {
    const storedPalette = localStorage.getItem('stroke-your-brush-palette');
    if (storedPalette) {
      try {
        const parsed = JSON.parse(storedPalette);
        if (Array.isArray(parsed)) setSavedPalette(parsed.filter((value): value is string => typeof value === 'string'));
      } catch { /* malformed palette is ignored */ }
    }
  }, []);
  useEffect(() => { localStorage.setItem('stroke-your-brush-palette', JSON.stringify(savedPalette)); }, [savedPalette]);
  useEffect(() => { localStorage.setItem(saveKey, JSON.stringify(mode === 'draw' ? { strokes, background } : { frames, background })); }, [background, frames, mode, saveKey, strokes]);
  useEffect(() => {
    if (!playing || mode !== 'animate') return;
    const timer = window.setInterval(() => setFrameIndex((index) => {
      if (index === frames.length - 1 && !loop) {
        setPlaying(false);
        return index;
      }
      return (index + 1) % frames.length;
    }), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [fps, frames.length, loop, mode, playing]);
  useEffect(() => { if (mode === 'animate') { const next = frames[frameIndex] || []; setStrokes(next); setSelectedIndices([]); } }, [frameIndex, frames, mode]); // intentional frame switch
  const addStroke = (stroke: Stroke) => {
    if (soundOn) playBrushSound(brush);
    setHistory((items) => [...items, strokes]);
    setRedoStack([]);
    const next = [...strokes, stroke];
    setStrokes(next);
    if (mode === 'animate') setFrames((items) => items.map((frame, index) => index === frameIndex ? next : frame));
  };
  const undo = () => { if (!history.length) return; const previous = history[history.length - 1]; setRedoStack((items) => [strokes, ...items]); setHistory((items) => items.slice(0, -1)); setStrokes(previous); if (mode === 'animate') setFrames((items) => items.map((frame, index) => index === frameIndex ? previous : frame)); };
  const redo = () => { if (!redoStack.length) return; const next = redoStack[0]; setHistory((items) => [...items, strokes]); setRedoStack((items) => items.slice(1)); setStrokes(next); if (mode === 'animate') setFrames((items) => items.map((frame, index) => index === frameIndex ? next : frame)); };
  const clear = () => { if (!window.confirm('Clear this page? Your local autosave will be replaced.')) return; setHistory((items) => [...items, strokes]); setStrokes([]); setSelectedIndices([]); if (mode === 'animate') setFrames((items) => items.map((frame, index) => index === frameIndex ? [] : frame)); };
  const exportPng = () => { const canvas = canvasRef.current; if (!canvas) return; canvas.toBlob((blob) => blob && downloadBlob(blob, `stroke-your-brush-${mode}.png`), 'image/png'); };
  const saveJson = () => { const data = mode === 'draw' ? { app: 'StrokeYourBrush', version: 1, mode, strokes, background } : { app: 'StrokeYourBrush', version: 1, mode, frames, background }; downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `stroke-your-brush-${mode}.json`); };
  const loadJson = () => fileRef.current?.click();
  const onFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result)); if (mode === 'draw' && Array.isArray(data.strokes)) setStrokes(data.strokes); if (mode === 'animate' && Array.isArray(data.frames) && data.frames.length) { setFrames(data.frames); setFrameIndex(0); setStrokes(data.frames[0]); } if (data.background?.color) setBackground(data.background); } catch { window.alert('That project file could not be opened.'); } }; reader.readAsText(file); event.target.value = ''; };
  const addFrame = () => { const copy = strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })); setFrames((items) => [...items, copy]); setFrameIndex(frames.length); setStrokes(copy); };
  const deleteFrame = () => { if (frames.length <= 1) return; const next = frames.filter((_, index) => index !== frameIndex); const index = Math.min(frameIndex, next.length - 1); setFrames(next); setFrameIndex(index); setStrokes(next[index]); };
  const previousFrame = mode === 'animate' && frameIndex > 0 ? frames[frameIndex - 1] : [];
  const addPaletteColor = () => setSavedPalette((items) => items.includes(color) ? items : [...items, color]);
  const updateStrokes = (next: Stroke[]) => {
    setHistory((items) => [...items, strokes]);
    setRedoStack([]);
    setStrokes(next);
    if (mode === 'animate') setFrames((items) => items.map((frame, index) => index === frameIndex ? next : frame));
  };
  const eraseStroke = (index: number) => updateStrokes(strokes.filter((_, strokeIndex) => strokeIndex !== index));
  const moveSelection = (delta: Point) => {
    if (!selectedIndices.length) return;
    const next = strokes.map((stroke, index) => selectedIndices.includes(index) ? { ...stroke, points: stroke.points.map((point) => ({ x: point.x + delta.x, y: point.y + delta.y })) } : stroke);
    setStrokes(next);
    if (mode === 'animate') setFrames((items) => items.map((frame, index) => index === frameIndex ? next : frame));
  };
  const duplicateSelection = () => {
    if (!selectedIndices.length) return;
    const copies = selectedIndices.map((index) => ({ ...strokes[index], points: strokes[index].points.map((point) => ({ x: point.x + 24, y: point.y + 24 })) }));
    const next = [...strokes, ...copies];
    updateStrokes(next);
    setSelectedIndices(copies.map((_, index) => strokes.length + index));
  };
  const deleteSelection = () => {
    if (!selectedIndices.length) return;
    updateStrokes(strokes.filter((_, index) => !selectedIndices.includes(index)));
    setSelectedIndices([]);
  };
  const exportMotion = () => {
    const canvas = canvasRef.current;
    if (!canvas || !('captureStream' in canvas) || typeof MediaRecorder === 'undefined') {
      window.alert('Motion export needs a browser with MediaRecorder support.');
      return;
    }
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => downloadBlob(new Blob(chunks, { type: 'video/webm' }), `stroke-your-brush-${mode}-motion.webm`);
    recorder.start();
    window.setTimeout(() => recorder.stop(), 2200);
  };
  const exportVideoNote = exportMotion;
  const reorderFrames = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= frames.length || to >= frames.length) return;
    const next = [...frames];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setFrames(next);
    setFrameIndex(to);
    setStrokes(next[to]);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
      }
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveJson();
      }
      if (event.key === 'Escape') setSelectedIndices([]);
      if (event.key === 'Delete' && selectedIndices.length) deleteSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelection, redo, saveJson, selectedIndices.length, undo]);
  return <div className="grain flex min-h-[100dvh] flex-col">
    <TopBar mode={mode} />
    <div className="flex flex-1 flex-col lg:flex-row">
       <BrushPanel mode={mode} brush={brush} setBrush={setBrush} color={color} setColor={setColor} size={size} setSize={setSize} background={background} setBackground={setBackground} tool={tool} setTool={setTool} savedPalette={savedPalette} addPaletteColor={addPaletteColor} />
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-5 md:px-7"><div><button type="button" onClick={() => navigate('/')} className="mb-2 flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><ChevronLeft size={14} /> notebook</button><h1 className="text-[25px] font-700 tracking-[-.05em]">{mode === 'draw' ? 'A fresh page' : 'Make it move'}</h1></div><span className="mono rounded-full border border-[hsl(var(--border))] px-3 py-1.5 text-[10px] uppercase tracking-[.12em] text-[hsl(var(--muted-foreground))]">{mode === 'draw' ? 'draw / live ink' : `${frames.length} frames / ${fps} fps`}</span></div>
         <Toolbar mode={mode} strokes={strokes} selectedIndices={selectedIndices} undo={undo} redo={redo} zoom={zoom} setZoom={setZoom} clear={clear} exportPng={exportPng} exportMotion={exportMotion} saveJson={saveJson} loadJson={loadJson} duplicateSelection={duplicateSelection} deleteSelection={deleteSelection} soundOn={soundOn} setSoundOn={setSoundOn} />
          <div className="workspace-grid flex min-h-[460px] flex-1 flex-col gap-4 p-4 md:p-7"><div className="mx-auto h-[min(62vh,610px)] min-h-[390px] w-full max-w-[950px]"><SketchCanvas strokes={strokes} background={background} brush={brush} color={color} size={size} tool={tool} selectedIndices={selectedIndices} onSelection={setSelectedIndices} onMoveSelection={moveSelection} onErase={eraseStroke} onStroke={addStroke} canvasRef={canvasRef} onionStrokes={mode === 'animate' && onion ? previousFrame : []} zoom={zoom} wiggle={mode === 'draw'} /></div>
          {mode === 'animate' ? <div className="mx-auto w-full max-w-[950px] rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] p-3 shadow-[0_4px_18px_hsl(var(--foreground)/.04)]"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><button type="button" onClick={() => setPlaying(!playing)} className="press flex h-8 items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 text-[11px] font-600 text-[hsl(var(--primary-foreground))]">{playing ? <Pause size={13} /> : <Play size={13} />} {playing ? 'Pause' : 'Play'}</button><button type="button" onClick={addFrame} className="press flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-[11px] font-600"><Plus size={13} /> Frame</button><button type="button" onClick={deleteFrame} disabled={frames.length <= 1} className="press flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))] disabled:opacity-30"><Trash2 size={13} /> Delete</button></div><div className="flex items-center gap-2"><button type="button" onClick={() => setOnion(!onion)} className={`press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] ${onion ? 'bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]'}`}><Layers3 size={13} /> Onion skin</button><button type="button" onClick={exportVideoNote} className="press flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] px-2.5 py-1.5 text-[11px]"><FileDown size={13} /> GIF / video</button></div></div><div className="flex gap-2 overflow-x-auto pb-1">{frames.map((frame, index) => <button type="button" key={`frame-${index}`} onClick={() => { setFrameIndex(index); setStrokes(frame); }} className={`group relative min-w-[86px] rounded-xl border p-1 text-left ${frameIndex === index ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.08)]' : 'border-[hsl(var(--border))]'}`}><div className="relative h-14 overflow-hidden rounded-lg" style={{ background: background.color }}><div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(135deg, transparent 45%, #ef5b67 46%, #ef5b67 51%, transparent 52%)' }} />{frame.length > 0 && <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />}</div><span className="mono px-1 text-[9px] text-[hsl(var(--muted-foreground))]">frame {String(index + 1).padStart(2, '0')}</span></button>)}</div></div> : <div className="mx-auto flex w-full max-w-[950px] items-center justify-between rounded-xl border border-dashed border-[hsl(var(--border))] px-4 py-3 text-[11px] text-[hsl(var(--muted-foreground))]"><span className="flex items-center gap-2"><WandSparkles size={15} className="text-[hsl(var(--accent))]" /> Tip: try a new brush mid-sketch. Contrast makes happy accidents.</span><span className="mono hidden sm:block">{strokes.length} mark{strokes.length === 1 ? '' : 's'}</span></div>}</div>
      </main>
      <aside className="hidden w-[182px] shrink-0 border-l border-[hsl(var(--border))] bg-[hsl(var(--card)/.28)] p-4 xl:block"><p className="mono mb-3 text-[10px] uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">Layers</p>{layers.map((layer, index) => <div key={layer} className="mb-2 flex items-center gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card)/.5)] px-2.5 py-2 text-[11px]"><span className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--secondary))]'}`} />{layer}</div>)}<button type="button" onClick={() => setLayers((items) => [...items, `Layer ${items.length + 1}`])} className="mt-1 flex items-center gap-1 text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"><Plus size={13} /> Add layer</button><div className="mt-12 border-t border-[hsl(var(--border))] pt-4"><p className="mono text-[9px] uppercase tracking-[.14em] text-[hsl(var(--muted-foreground))]">Autosaved</p><p className="mt-2 text-[12px] leading-5">This sketch lives in this browser until you export it.</p></div></aside>
    </div>
    <input ref={fileRef} type="file" accept="application/json" onChange={onFile} className="hidden" />
  </div>;
}

function NotFound() { return <div className="flex min-h-[100dvh] items-center justify-center p-6 text-center"><div><p className="mono text-[11px] text-[hsl(var(--accent))]">404 / blank margin</p><h1 className="mt-3 text-4xl font-700">This page wandered off.</h1><Link href="/" className="mt-6 inline-block rounded-full bg-[hsl(var(--primary))] px-5 py-3 text-sm text-[hsl(var(--primary-foreground))]">Back to the notebook</Link></div></div>; }

function Router() {
  return <Switch><Route path="/" component={Landing} /><Route path="/draw"><Workspace mode="draw" /></Route><Route path="/animate"><Workspace mode="animate" /></Route><Route component={NotFound} /></Switch>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary><Router /></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
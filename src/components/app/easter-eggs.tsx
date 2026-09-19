/* ═══════════════════════════════════════════════════════════════════════════
   Easter Eggs — hidden delights that never interfere with real work.

   Contents:
   • KonamiListener  — ↑↑↓↓←→←→BA → confetti + the secret Snake arcade
   • SnakeGame       — zero-dependency canvas mini-game in a Dialog
   • fireConfetti    — DOM-particle burst (self-cleaning), reusable
   • consoleEasterEgg — ASCII greeting for people who open DevTools

   Design rules: lazy-mounted, no dependencies, no network, no layout
   impact, everything silently self-cleans. Repo: github.com/abhinavdatta
   ═══════════════════════════════════════════════════════════════════════════ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Gamepad2, RotateCcw } from 'lucide-react';

/* ── Konami sequence ───────────────────────────────────────────────────── */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

export function useKonami(onUnlock: () => void) {
  const pos = useRef(0);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === KONAMI[pos.current]) {
        pos.current += 1;
        if (pos.current === KONAMI.length) {
          pos.current = 0;
          onUnlock();
        }
      } else {
        pos.current = key === KONAMI[0] ? 1 : 0;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUnlock]);
}

/* ── Confetti (DOM particles, self-cleaning) ────────────────────────────── */

const CONFETTI_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7'];

export function fireConfetti(originX?: number, originY?: number) {
  if (typeof document === 'undefined') return;
  const x = originX ?? window.innerWidth / 2;
  const y = originY ?? window.innerHeight / 3;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '9999' });
  document.body.appendChild(host);

  const particles: Array<{ el: HTMLElement; vx: number; vy: number; rot: number; vr: number }> = [];
  for (let i = 0; i < 90; i++) {
    const el = document.createElement('div');
    const size = 5 + Math.random() * 6;
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * 0.6}px;background:${
      CONFETTI_COLORS[i % CONFETTI_COLORS.length]
    };border-radius:1px;opacity:1;will-change:transform;`;
    host.appendChild(el);
    particles.push({ el, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 4, rot: Math.random() * 360, vr: (Math.random() - 0.5) * 18 });
  }

  let frame = 0;
  function step() {
    frame += 1;
    for (const p of particles) {
      p.vy += 0.18; // gravity
      p.rot += p.vr;
      const cur = p.el.style.transform.match(/[-\d.]+/g);
      const cx = cur ? parseFloat(cur[0]) : 0;
      const cy = cur ? parseFloat(cur[1]) : 0;
      p.el.style.transform = `translate(${cx + p.vx}px, ${cy + p.vy}px) rotate(${p.rot}deg)`;
      p.el.style.opacity = String(Math.max(0, 1 - frame / 80));
    }
    if (frame < 80) requestAnimationFrame(step);
    else host.remove();
  }
  requestAnimationFrame(step);
}

/* ── Console greeting (for the curious who open DevTools) ───────────────── */

export function consoleEasterEgg() {
  console.log(
    '%c LMCC %c Legal Metrology Compliance Checker ',
    'background:#6366f1;color:#fff;font-weight:bold;border-radius:3px 0 0 3px;padding:2px 6px;',
    'background:#18181b;color:#a1a1aa;padding:2px 6px;border-radius:0 3px 3px 0;'
  );
  console.log(
    `%c
  ██╗     ███╗   ███╗ ██████╗ ██████╗
  ██║     ████╗ ████║██╔════╝ ██╔══██╗
  ██║     ██╔████╔██║██║  ███╗██║  ██║
  ██║     ██║╚██╔╝██║██║   ██║██║  ██║
  ███████╗██║ ╚═╝ ██║╚██████╔╝██████╔╝
  ╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝
`,
    'color:#6366f1;font-family:monospace;'
  );
  console.log('%c🥚 Curious mind detected. Try the old code on your keyboard: ↑ ↑ ↓ ↓ ← → ← → B A', 'color:#22c55e;font-size:12px;');
  console.log('%cAlso: the logo in the sidebar is clickier than it appears.', 'color:#a1a1aa;font-size:11px;');
}

/* ── Snake — the Konami reward ──────────────────────────────────────────── */

const CELL = 15;
const GRID = 20;
const SIZE = CELL * GRID;

interface Pt { x: number; y: number }

export function SnakeGame({ open, onClose }: { open: boolean; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [dead, setDead] = useState(false);
  const [started, setStarted] = useState(false);

  const game = useRef({
    snake: [{ x: 10, y: 10 }] as Pt[],
    dir: { x: 1, y: 0 },
    queuedDir: { x: 1, y: 0 },
    food: { x: 14, y: 10 } as Pt,
    alive: true,
    started: false,
    stepMs: 130,
  });

  /* Lazy read: this component only mounts when the user unlocks the dialog,
     so localStorage is always available — no effect-time setState needed. */
  const [bestLoaded, setBestLoaded] = useState(false);
  if (!bestLoaded) {
    setBestLoaded(true);
    setBest(Number(localStorage.getItem('lmcc-snake-best') || '0'));
  }

  const spawnFood = useCallback(() => {
    const g = game.current;
    let f: Pt;
    do {
      f = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    } while (g.snake.some((s) => s.x === f.x && s.y === f.y));
    g.food = f;
  }, []);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const g = game.current;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(148,163,184,0.07)';
    for (let i = 1; i < GRID; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL); ctx.stroke();
    }
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(g.food.x * CELL + CELL / 2, g.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    g.snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#86efac' : '#4ade80';
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }, []);

  const reset = useCallback(() => {
    game.current = {
      snake: [{ x: 10, y: 10 }], dir: { x: 1, y: 0 }, queuedDir: { x: 1, y: 0 },
      food: { x: 14, y: 10 }, alive: true, started: false, stepMs: 130,
    };
    setScore(0); setDead(false); setStarted(false);
    draw();
  }, [draw]);

  /* keyboard */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const g = game.current;
      const dirs: Record<string, Pt> = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
      };
      if (e.key === ' ' && (!g.started || !g.alive)) {
        e.preventDefault();
        if (!g.alive) reset();
        g.started = true; setStarted(true);
        return;
      }
      const d = dirs[e.key] ?? dirs[e.key.toLowerCase()];
      if (d && !(d.x === -g.dir.x && d.y === -g.dir.y)) {
        e.preventDefault();
        g.queuedDir = d;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, reset]);

  /* game loop */
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    let last = 0;
    let stopped = false;

    function tick(t: number) {
      if (stopped) return;
      const g = game.current;
      raf = requestAnimationFrame(tick);
      if (!g.started || !g.alive || t - last < g.stepMs) return;
      last = t;

      g.dir = g.queuedDir;
      const head = { x: g.snake[0].x + g.dir.x, y: g.snake[0].y + g.dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID || g.snake.some((s) => s.x === head.x && s.y === head.y)) {
        g.alive = false;
        setDead(true);
        setScore((sc) => {
          setBest((b) => {
            const nb = Math.max(b, sc);
            localStorage.setItem('lmcc-snake-best', String(nb));
            return nb;
          });
          return sc;
        });
        return;
      }
      g.snake.unshift(head);
      if (head.x === g.food.x && head.y === g.food.y) {
        spawnFood();
        g.stepMs = Math.max(70, g.stepMs - 4);
        setScore((s) => s + 1);
      } else {
        g.snake.pop();
      }
      draw();
    }

    raf = requestAnimationFrame(tick);
    draw();
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [open, draw, spawnFood]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[360px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gamepad2 className="h-4 w-4" style={{ color: 'var(--primary)' }} />
            Secret Scan Arcade — Snake
          </DialogTitle>
          <DialogDescription>
            You found it. Arrows / WASD to move, Space to start. The QA team insisted this ship.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>Score <strong style={{ color: 'var(--text-primary)' }}>{score}</strong></span>
            <span>Best <strong style={{ color: 'var(--text-primary)' }}>{best}</strong></span>
          </div>
          <div className="relative">
            <canvas ref={canvasRef} width={SIZE} height={SIZE} className="rounded-lg border" style={{ borderColor: 'var(--border-default)' }} />
            {(!started || dead) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg" style={{ background: 'rgba(2,6,23,0.72)' }}>
                <p className="text-sm font-semibold text-white">{dead ? `Game over — ${score} points` : 'Ready?'}</p>
                <Button size="sm" onClick={() => { if (dead) reset(); game.current.started = true; setStarted(true); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> {dead ? 'Play again' : 'Start (or press Space)'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

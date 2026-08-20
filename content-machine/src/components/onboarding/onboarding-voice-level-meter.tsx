"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

type Props = {
  stream: MediaStream | null;
  active: boolean;
  className?: string;
};

function drawIdleWave(g: CanvasRenderingContext2D, w: number, h: number) {
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  g.strokeStyle = "rgba(255,255,255,0.12)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, mid);
  g.lineTo(w, mid);
  g.stroke();

  g.strokeStyle = "rgba(251, 191, 36, 0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = mid + Math.sin(x * 0.04) * 2;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

export function OnboardingVoiceLevelMeter({ stream, active, className }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !wrap) return;

    const resize = () => {
      // Use clientWidth/clientHeight — not getBoundingClientRect — so border/ring
      // on the wrapper cannot feed back into canvas height and grow the box forever.
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      const g = canvas.getContext("2d");
      if (g) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      return { w, h, g };
    };

    let sized = resize();
    const ro = new ResizeObserver(() => {
      sized = resize();
    });
    ro.observe(wrap);

    const g = sized.g;
    if (!g) return;

    if (!active || !stream) {
      cancelAnimationFrame(rafRef.current);
      drawIdleWave(g, sized.w, sized.h);
      return () => ro.disconnect();
    }

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    const timeData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const draw = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 1 || h < 1) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      let rms = 0;
      for (let i = 0; i < timeData.length; i++) {
        const n = (timeData[i] - 128) / 128;
        rms += n * n;
      }
      rms = Math.sqrt(rms / timeData.length);

      g.clearRect(0, 0, w, h);

      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(9, 9, 11, 0.55)");
      bg.addColorStop(1, "rgba(24, 24, 27, 0.35)");
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);

      const mid = h / 2;
      g.strokeStyle = "rgba(255,255,255,0.06)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, mid);
      g.lineTo(w, mid);
      g.stroke();

      const points: { x: number; y: number }[] = [];
      const step = Math.max(1, Math.floor(timeData.length / w));
      for (let x = 0; x < w; x++) {
        const idx = Math.min(timeData.length - 1, x * step);
        const v = (timeData[idx] - 128) / 128;
        const y = mid + v * (h * 0.38);
        points.push({ x, y });
      }

      const fillGrad = g.createLinearGradient(0, 0, w, 0);
      fillGrad.addColorStop(0, "rgba(245, 158, 11, 0.08)");
      fillGrad.addColorStop(0.5, "rgba(251, 191, 36, 0.22)");
      fillGrad.addColorStop(1, "rgba(245, 158, 11, 0.08)");

      g.beginPath();
      g.moveTo(0, mid);
      for (const p of points) g.lineTo(p.x, p.y);
      g.lineTo(w, mid);
      g.closePath();
      g.fillStyle = fillGrad;
      g.fill();

      const strokeGrad = g.createLinearGradient(0, 0, w, 0);
      strokeGrad.addColorStop(0, "rgba(251, 191, 36, 0.55)");
      strokeGrad.addColorStop(0.5, "rgba(253, 224, 71, 0.95)");
      strokeGrad.addColorStop(1, "rgba(251, 191, 36, 0.55)");

      g.strokeStyle = strokeGrad;
      g.lineWidth = 2;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.shadowColor = "rgba(251, 191, 36, 0.45)";
      g.shadowBlur = 6;
      g.beginPath();
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (i === 0) g.moveTo(p.x, p.y);
        else g.lineTo(p.x, p.y);
      }
      g.stroke();
      g.shadowBlur = 0;

      const barCount = 24;
      const barW = w / barCount;
      const barGap = 2;
      for (let i = 0; i < barCount; i++) {
        const idx = Math.min(freqData.length - 1, Math.floor((i / barCount) * freqData.length * 0.5));
        const v = freqData[idx] / 255;
        const barH = Math.max(3, v * h * 0.22);
        const x = i * barW + barGap;
        const y = h - barH - 6;
        const alpha = 0.15 + v * 0.55;
        g.fillStyle = `rgba(251, 191, 36, ${alpha})`;
        g.beginPath();
        g.roundRect(x, y, barW - barGap * 2, barH, 2);
        g.fill();
      }

      const levelW = Math.min(w - 16, Math.max(12, rms * w * 1.6));
      g.fillStyle = `rgba(251, 191, 36, ${0.25 + rms * 0.65})`;
      g.beginPath();
      g.roundRect(8, h - 4, levelW, 3, 1.5);
      g.fill();

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      source.disconnect();
      void audioCtx.close();
    };
  }, [active, stream]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative h-[4.5rem] w-full max-w-lg overflow-hidden rounded-2xl border border-amber-300/20 bg-zinc-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
        active && "ring-1 ring-amber-300/25",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.07),transparent_68%)]" />
      <canvas ref={canvasRef} className="relative block h-full w-full" aria-hidden />
    </div>
  );
}

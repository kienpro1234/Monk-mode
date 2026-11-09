import React, { useEffect, useRef } from 'react';

interface ShanshuiCanvasBgProps {
  isMonkModeOn: boolean;
  isLockScreenView?: boolean;
}

/**
 * Custom Canvas Shader Effect (Section 5: Thẩm mỹ Tranh Thủy Mặc & Cổ Thư)
 * Renders drifting mountain mist, sumi ink wash particles, and subtle wind across the Shanshui painting.
 */
export const ShanshuiCanvasBg: React.FC<ShanshuiCanvasBgProps> = ({
  isMonkModeOn,
  isLockScreenView = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Mist clouds
    const mistLayers = Array.from({ length: 14 }, (_, i) => ({
      x: Math.random() * width,
      y: height * (0.15 + (i / 14) * 0.75),
      radiusX: 260 + Math.random() * 340,
      radiusY: 48 + Math.random() * 75,
      speed: (0.18 + Math.random() * 0.35) * (i % 2 === 0 ? 1 : -0.7),
      alpha: 0.04 + Math.random() * 0.06,
    }));

    // Floating sumi-ink / mountain snow-ash motes
    const motes = Array.from({ length: 38 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 1 + Math.random() * 2.2,
      vx: 0.15 + Math.random() * 0.4,
      vy: -0.08 + Math.random() * 0.25,
      alpha: 0.12 + Math.random() * 0.28,
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw drifting mountain mist
      for (const mist of mistLayers) {
        mist.x += mist.speed;
        if (mist.x - mist.radiusX > width) mist.x = -mist.radiusX;
        if (mist.x + mist.radiusX < 0) mist.x = width + mist.radiusX;

        const grad = ctx.createRadialGradient(
          mist.x,
          mist.y,
          10,
          mist.x,
          mist.y,
          mist.radiusX
        );
        const mistColor = isMonkModeOn ? '246, 244, 238' : '225, 220, 210';
        grad.addColorStop(0, `rgba(${mistColor}, ${mist.alpha})`);
        grad.addColorStop(1, `rgba(${mistColor}, 0)`);

        ctx.save();
        ctx.translate(mist.x, mist.y);
        ctx.scale(1, mist.radiusY / mist.radiusX);
        ctx.beginPath();
        ctx.arc(0, 0, mist.radiusX, 0, Math.PI * 2);
        ctx.restore();
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Draw drifting mountain wind / ink particles
      for (const m of motes) {
        m.x += m.vx;
        m.y += m.vy;
        if (m.x > width) m.x = 0;
        if (m.y > height) m.y = 0;
        if (m.y < 0) m.y = height;

        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = isMonkModeOn
          ? `rgba(246, 244, 238, ${m.alpha})`
          : `rgba(28, 29, 31, ${m.alpha * 0.7})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [isMonkModeOn, isLockScreenView]);

  const bgImage = isLockScreenView
    ? './assets/shanshui-mountains.jpg'
    : './assets/shanshui-monk-temple.jpg';

  return (
    <div className="shanshui-bg-container" aria-hidden="true">
      <div
        className="shanshui-bg-artwork"
        style={{
          backgroundImage: `url('${bgImage}')`,
          opacity: isLockScreenView ? 0.38 : isMonkModeOn ? 0.24 : 0.18,
          filter: isMonkModeOn ? 'contrast(1.08) grayscale(0.15)' : 'sepia(0.12)',
        }}
      />
      <canvas ref={canvasRef} className="shanshui-mist-canvas" />
    </div>
  );
};

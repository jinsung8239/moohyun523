import React, { useEffect, useRef } from 'react';
import { AudioEngine } from '../audio/AudioEngine';

interface VisualizerProps {
  isPlaying: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const engine = AudioEngine.getInstance();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Logic Pro dark panel background
      ctx.fillStyle = '#1E1E1E';
      ctx.fillRect(0, 0, width, height);

      // Grid guidelines
      ctx.strokeStyle = '#2E2E2E';
      ctx.lineWidth = 1;
      const gridRows = 6;
      const gridCols = 12;
      for (let i = 1; i < gridRows; i++) {
        const y = (height / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      for (let i = 1; i < gridCols; i++) {
        const x = (width / gridCols) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      if (!engine.analyser || !engine.isPlaying) {
        // Draw static baseline in Logic Pro aqua
        ctx.strokeStyle = 'rgba(59, 177, 216, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        return;
      }

      const bufferLength = engine.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      // 1. Draw Spectrum bars with matching Logic Gain Meter color palette
      engine.analyser.getByteFrequencyData(dataArray);
      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height * 0.75;

        // Gradient: Green -> Yellow -> Orange -> Red
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, '#22C55E');   // Green
        grad.addColorStop(0.6, '#FACC15'); // Yellow
        grad.addColorStop(0.85, '#F97316');// Orange
        grad.addColorStop(1, '#EF4444');   // Red

        ctx.fillStyle = grad;
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

        x += barWidth + 1;
      }

      // 2. Draw Waveform line
      engine.analyser.getByteTimeDomainData(dataArray);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#3BB1D8'; // Aqua playhead/active color
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#3BB1D8';
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let waveX = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const waveY = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(waveX, waveY);
        } else {
          ctx.lineTo(waveX, waveY);
        }

        waveX += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <div className="visualizer-container" style={{ flex: 1 }}>
      <canvas ref={canvasRef} className="visualizer-canvas" />
    </div>
  );
};

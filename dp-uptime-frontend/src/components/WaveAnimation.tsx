import React from 'react';

export const WaveAnimation: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute bottom-0 left-0 w-full h-64"
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop
              offset="0%"
              stopColor={isDark ? '#1e40af' : '#3b82f6'}
              stopOpacity="0.1"
            />
            <stop
              offset="50%"
              stopColor={isDark ? '#0ea5e9' : '#06b6d4'}
              stopOpacity="0.2"
            />
            <stop
              offset="100%"
              stopColor={isDark ? '#1e40af' : '#3b82f6'}
              stopOpacity="0.1"
            />
          </linearGradient>
        </defs>
        <path
          d="M0,60 C300,120 600,0 900,60 C1050,90 1150,30 1200,60 L1200,120 L0,120 Z"
          fill="url(#waveGradient)"
          className="animate-pulse"
        />
        <path
          d="M0,80 C300,20 600,100 900,40 C1050,10 1150,70 1200,40 L1200,120 L0,120 Z"
          fill="url(#waveGradient)"
          className="animate-pulse"
          style={{ animationDelay: '1s', animationDuration: '3s' }}
        />
      </svg>
    </div>
  );
};
import React from 'react';

interface GlowingOrbProps {
  size: number;
  color: string;
  className?: string;
  delay?: number;
}

export const GlowingOrb: React.FC<GlowingOrbProps> = ({ 
  size, 
  color, 
  className = '', 
  delay = 0 
}) => {
  return (
    <div
      className={`absolute rounded-full animate-pulse ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}40 0%, ${color}10 50%, transparent 100%)`,
        animationDelay: `${delay}ms`,
        animationDuration: '3s'
      }}
    >
      <div
        className="absolute inset-2 rounded-full animate-ping"
        style={{
          background: `radial-gradient(circle, ${color}60 0%, transparent 70%)`,
          animationDelay: `${delay + 500}ms`,
          animationDuration: '2s'
        }}
      />
    </div>
  );
};
import React, { useEffect, useState } from 'react';

export const MouseGlow: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div
      className={`fixed pointer-events-none z-30 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{
        left: mousePosition.x - 200,
        top: mousePosition.y - 200,
        width: 400,
        height: 400,
      }}
    >
      <div
        className="w-full h-full rounded-full animate-pulse"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(147, 197, 253, 0.1) 30%, rgba(59, 130, 246, 0.05) 60%, transparent 100%)'
            : 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, rgba(147, 197, 253, 0.05) 30%, rgba(59, 130, 246, 0.02) 60%, transparent 100%)',
          filter: 'blur(1px)',
        }}
      />
      <div
        className="absolute inset-16 rounded-full animate-ping"
        style={{
          background: isDark
            ? 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, rgba(147, 197, 253, 0.1) 50%, transparent 70%)'
            : 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(147, 197, 253, 0.08) 50%, transparent 70%)',
          animationDuration: '2s',
        }}
      />
    </div>
  );
};
import React from 'react';
import { Server, Globe, Shield, Zap, Network, Activity } from 'lucide-react';

export const FloatingElements: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  const elements = [
    { Icon: Server, delay: 0, position: 'top-20 left-20', size: 'w-8 h-8' },
    { Icon: Globe, delay: 1000, position: 'top-40 right-32', size: 'w-6 h-6' },
    { Icon: Shield, delay: 2000, position: 'top-1/3 left-1/4', size: 'w-10 h-10' },
    { Icon: Zap, delay: 1500, position: 'top-1/2 right-20', size: 'w-7 h-7' },
    { Icon: Network, delay: 3000, position: 'bottom-1/3 left-16', size: 'w-9 h-9' },
    { Icon: Activity, delay: 2500, position: 'bottom-40 right-1/4', size: 'w-8 h-8' },
  ];

  return (
    <>
      {elements.map(({ Icon, delay, position, size }, index) => (
        <div
          key={index}
          className={`absolute ${position} animate-bounce opacity-20 hover:opacity-60 transition-all duration-500`}
          style={{
            animationDelay: `${delay}ms`,
            animationDuration: '4s',
          }}
        >
          <div
            className={`p-4 rounded-full ${
              isDark
                ? 'bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-400/20'
                : 'bg-gradient-to-br from-blue-100/50 to-cyan-100/50 border border-blue-300/30'
            } backdrop-blur-sm`}
          >
            <Icon
              className={`${size} ${
                isDark ? 'text-blue-400' : 'text-blue-600'
              } animate-pulse`}
            />
          </div>
        </div>
      ))}
    </>
  );
};
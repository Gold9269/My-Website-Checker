import React, { useEffect, useState, useRef } from 'react';
import { Shield, Activity, Zap, Globe, Users, Eye, Award, TrendingUp, Network, Server, Cpu, Lock, Layers, Sparkles, ArrowRight, ChevronDown } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '@clerk/clerk-react';

// Advanced 3D Floating Elements with Physics
const Advanced3DElements = () => {
  const [elements, setElements] = useState<Array<{
    id: number;
    x: number;
    y: number;
    z: number;
    size: number;
    shape: string;
    rotationX: number;
    rotationY: number;
    rotationZ: number;
    speed: number;
    color: string;
    glowIntensity: number;
  }>>([]);

  useEffect(() => {
    const shapes = ['cube', 'pyramid', 'octahedron', 'dodecahedron', 'icosahedron', 'torus'];
    const colors = ['blue', 'purple', 'cyan', 'indigo', 'violet', 'pink'];
    
    const newElements = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      z: Math.random() * 100,
      size: Math.random() * 60 + 30,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rotationX: Math.random() * 360,
      rotationY: Math.random() * 360,
      rotationZ: Math.random() * 360,
      speed: Math.random() * 0.5 + 0.2,
      color: colors[Math.floor(Math.random() * colors.length)],
      glowIntensity: Math.random() * 0.8 + 0.2,
    }));
    setElements(newElements);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden perspective-1000">
      {elements.map((element) => (
        <div
          key={element.id}
          className={`absolute floating-3d-element floating-${element.shape} floating-${element.color}`}
          style={{
            left: `${element.x}%`,
            top: `${element.y}%`,
            width: `${element.size}px`,
            height: `${element.size}px`,
            transform: `translateZ(${element.z}px) rotateX(${element.rotationX}deg) rotateY(${element.rotationY}deg) rotateZ(${element.rotationZ}deg)`,
            animationDuration: `${20 / element.speed}s`,
            filter: `drop-shadow(0 0 ${element.glowIntensity * 20}px rgba(59, 130, 246, ${element.glowIntensity}))`,
          }}
        />
      ))}
    </div>
  );
};

// Matrix Rain Effect
const MatrixRain = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const matrix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
    const matrixArray = matrix.split("");

    const fontSize = 10;
    const columns = canvas.width / fontSize;
    const drops: number[] = [];

    for (let x = 0; x < columns; x++) {
      drops[x] = 1;
    }

    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0ff';
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = matrixArray[Math.floor(Math.random() * matrixArray.length)];
        ctx.fillStyle = `rgba(0, 255, 255, ${Math.random() * 0.5 + 0.1})`;
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 35);
    return () => clearInterval(interval);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none opacity-20"
      style={{ mixBlendMode: 'screen' }}
    />
  );
};

// Holographic Grid
const HolographicGrid = () => {
  return (
    <div className="fixed inset-0 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent animate-pulse"></div>
      <div className="absolute inset-0" style={{
        backgroundImage: `
          linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        animation: 'grid-move 20s linear infinite'
      }}></div>
    </div>
  );
};

// Glitch Text Effect
// Glitch Text Effect (fixed: derive plain text for data-text)
const GlitchText = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => {
  const getTextFromNode = (node: React.ReactNode): string => {
    if (node == null) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getTextFromNode).join("");
    if (React.isValidElement(node)) return getTextFromNode((node.props as any).children);
    return "";
  };

  const plainText = getTextFromNode(children);

  return (
    <div className={`relative ${className}`}>
      <div className="glitch-text" data-text={plainText}>
        {children}
      </div>
    </div>
  );
};


// Neon Feature Card
const NeonFeatureCard = ({ icon: Icon, title, description, color = "blue" }: { 
  icon: any, 
  title: string, 
  description: string,
  color?: string 
}) => (
  <div className={`group relative p-6 rounded-2xl bg-black/40 backdrop-blur-xl border border-${color}-500/30 hover:border-${color}-400/60 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-${color}-500/25`}>
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
    <div className={`relative z-10 flex items-start space-x-4`}>
      <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-r from-${color}-500 to-${color}-600 flex items-center justify-center shadow-lg shadow-${color}-500/50 group-hover:shadow-${color}-400/70 transition-all duration-300`}>
        <Icon size={24} className="text-white" />
      </div>
      <div className="flex-1">
        <h4 className="text-white font-bold text-lg mb-2 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-300 group-hover:bg-clip-text transition-all duration-300">
          {title}
        </h4>
        <p className="text-gray-300 text-sm leading-relaxed group-hover:text-gray-200 transition-colors duration-300">
          {description}
        </p>
      </div>
    </div>
    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r from-${color}-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl`}></div>
  </div>
);

// Cyber Button
const CyberButton = ({ 
  children, 
  onClick, 
  variant = "primary",
  className = "" 
}: { 
  children: React.ReactNode, 
  onClick: () => void,
  variant?: "primary" | "secondary",
  className?: string 
}) => {
  const isPrimary = variant === "primary";
  const gradientFrom = isPrimary ? "from-blue-600" : "from-cyan-600";
  const gradientTo = isPrimary ? "to-purple-600" : "to-blue-600";
  const shadowColor = isPrimary ? "blue" : "cyan";

  return (
    <button
      onClick={onClick}
      className={`group relative px-10 py-5 bg-gradient-to-r ${gradientFrom} ${gradientTo} rounded-2xl text-white font-bold text-xl transition-all duration-500 hover:shadow-2xl hover:shadow-${shadowColor}-500/50 hover:-translate-y-2 hover:scale-105 ${className}`}
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      <div className="absolute inset-0 rounded-2xl border-2 border-transparent bg-gradient-to-r from-white/30 to-transparent bg-clip-border opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      <span className="relative z-10 flex items-center justify-center">
        {children}
        <ArrowRight size={24} className="ml-3 group-hover:translate-x-2 transition-transform duration-300" />
      </span>
      <div className={`absolute inset-0 rounded-2xl bg-gradient-to-r ${gradientFrom} ${gradientTo} opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg`}></div>
    </button>
  );
};

// Stats Counter
const StatsCounter = ({ value, label, icon: Icon }: { value: string, label: string, icon: any }) => (
  <div className="flex items-center space-x-3 px-6 py-4 bg-black/30 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105">
    <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
      <Icon size={20} className="text-white" />
    </div>
    <div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-gray-400 uppercase tracking-wider">{label}</div>
    </div>
  </div>
);

function GetStarted() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
    
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleBecomeValidator = () => {
    window.location.href = '/become-validator';
  };

  const handleMonitorWebsites = () => {
    window.location.href = '/tracker';
  };
  const { getToken } = useAuth();
  const [activeValidators, setActiveValidators] = useState<number>(0);
  const [totalwebsites, setTotalWebsites] = useState<number>(0);

  useEffect(() => {
    const fetchActiveValidators = async () => {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch (err) {
        token = null;
      }

      if (!token) {
        console.error("You are not authenticated. Please sign in before fetching validators.");
        return;
      }

      try {
        const backendUrl = "http://localhost:5000";
        const res = await axios.get(`${backendUrl}/api/v1/get-all-validator`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15_000,
        });
        //console.log("response of get all validators is ", res);
        if (res.data && typeof res.data.count === 'number') {
          setActiveValidators(res.data.count);
        }
      } catch (error) {
        console.log(error);
      }
    };
    fetchActiveValidators();
  }, [getToken]);
  useEffect(() => {
    const fetchTotalWebsites = async () => {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch (err) {
        token = null;
      }

      if (!token) {
        console.error("You are not authenticated. Please sign in before fetching validators.");
        return;
      }

      try {
        const backendUrl = "http://localhost:5000";
        const res = await axios.get(`${backendUrl}/api/v1/get-all-db-websites`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 15_000,
        });
        console.log("response of get all websites is ", res);
        if (res.data) {
          setTotalWebsites(res.data.websites.length);
        }
      } catch (error) {
        console.log(error);
      }
    };
    fetchTotalWebsites();
  }, [getToken]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Dynamic cursor glow */}
      <div 
        className="fixed w-96 h-96 pointer-events-none z-50 transition-all duration-300 ease-out"
        style={{
          left: mousePosition.x - 192,
          top: mousePosition.y - 192,
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(147, 51, 234, 0.1) 50%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Animated background layers */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900/50 to-indigo-900/50"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/30 via-transparent to-cyan-900/30"></div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-black/60"></div>
      
      {/* Matrix Rain */}
      <MatrixRain />
      
      {/* Holographic Grid */}
      <HolographicGrid />
      
      {/* 3D Floating Elements */}
      <Advanced3DElements />

      {/* Main content */}
      <div className={`relative z-10 min-h-screen transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center min-h-screen px-8">
          
          {/* Logo and Brand */}
          <div className="text-center mb-16 animate-fade-in-up mt-8">
            <div className="flex items-center justify-center mb-8" onClick={() => window.location.assign("/")}>
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-500/50 animate-pulse">
                <Network size={40} className="text-white" />
              </div>
              <div className="ml-6">
                <GlitchText className="text-6xl font-black">
                  <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                    DecentWatch
                  </span>
                </GlitchText>
                <p className="text-gray-400 text-xl font-light tracking-wider">Decentralized Monitoring</p>
              </div>
            </div>
            
            <div className="mb-8 px-6 py-3 bg-black/40 backdrop-blur-xl rounded-full border border-blue-500/30 inline-block">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
                <span className="text-white font-medium">Enterprise-grade decentralized monitoring platform</span>
                <Sparkles size={16} className="text-blue-400 animate-spin" />
              </div>
            </div>
          </div>

          {/* Split Screen Content */}
          <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
            
            {/* Left Half - Become a Validator */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-black/40 backdrop-blur-2xl rounded-3xl border border-blue-500/30 p-12 hover:border-blue-400/50 transition-all duration-500 hover:scale-105">
                
                {/* Icon */}
                <div className="text-center mb-8">
                  <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mb-6 shadow-2xl shadow-blue-500/50 hover:shadow-blue-400/70 transition-all duration-300 hover:scale-110">
                    <Shield size={48} className="text-white" />
                  </div>
                </div>

                {/* Title */}
                <div className="text-center mb-8">
                  <GlitchText className="text-5xl font-black mb-4">
                    <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                      Become a
                    </span>
                  </GlitchText>
                  <GlitchText className="text-5xl font-black">
                    <span className="text-white">Validator</span>
                  </GlitchText>
                </div>

                {/* Description */}
                <p className="text-gray-300 text-xl leading-relaxed mb-10 text-center">
                  Join the most advanced decentralized monitoring network. Earn rewards while securing the future of web infrastructure.
                </p>

                {/* Features */}
                <div className="space-y-6 mb-12">
                  <NeonFeatureCard 
                    icon={Zap}
                    title="Earn Crypto Rewards"
                    description="Get paid in tokens for every successful validation. Higher accuracy = higher rewards."
                    color="blue"
                  />
                  <NeonFeatureCard 
                    icon={Network}
                    title="Decentralized Power"
                    description="Be part of a trustless network that no single entity can control or manipulate."
                    color="purple"
                  />
                  <NeonFeatureCard 
                    icon={Award}
                    title="Build Reputation"
                    description="Gain trust and increase your validator score with consistent, accurate performance."
                    color="cyan"
                  />
                </div>

                {/* CTA Button */}
                <div className="text-center">
                  <CyberButton onClick={handleBecomeValidator} variant="primary">
                    <Zap size={24} className="mr-2" />
                    Start Validating
                  </CyberButton>
                </div>
              </div>
            </div>

            {/* Right Half - Monitor Websites */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 to-blue-600/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500"></div>
              <div className="relative bg-black/40 backdrop-blur-2xl rounded-3xl border border-cyan-500/30 p-12 hover:border-cyan-400/50 transition-all duration-500 hover:scale-105">
                
                {/* Icon */}
                <div className="text-center mb-8">
                  <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center mb-6 shadow-2xl shadow-cyan-500/50 hover:shadow-cyan-400/70 transition-all duration-300 hover:scale-110">
                    <Activity size={48} className="text-white" />
                  </div>
                </div>

                {/* Title */}
                <div className="text-center mb-8">
                  <GlitchText className="text-5xl font-black mb-4">
                    <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                      Monitor
                    </span>
                  </GlitchText>
                  <GlitchText className="text-5xl font-black">
                    <span className="text-white">Websites</span>
                  </GlitchText>
                </div>

                {/* Description */}
                <p className="text-gray-300 text-xl leading-relaxed mb-10 text-center">
                  Enterprise-grade monitoring with blockchain-verified uptime data. Trust in decentralized validation, not promises.
                </p>

                {/* Features */}
                <div className="space-y-6 mb-12">
                  <NeonFeatureCard 
                    icon={Globe}
                    title="Global Coverage"
                    description="Monitor from multiple geographic locations for true reliability insights and performance data."
                    color="cyan"
                  />
                  <NeonFeatureCard 
                    icon={Eye}
                    title="Real-time Alerts"
                    description="Instant notifications via multiple channels when your services go down or recover."
                    color="blue"
                  />
                  <NeonFeatureCard 
                    icon={TrendingUp}
                    title="Advanced Analytics"
                    description="Comprehensive reports with historical data, performance metrics, and predictive insights."
                    color="purple"
                  />
                </div>

                {/* CTA Button */}
                <div className="text-center">
                  <CyberButton onClick={handleMonitorWebsites} variant="secondary">
                    <Activity size={24} className="mr-2" />
                    Start Monitoring
                  </CyberButton>
                </div>
              </div>
            </div>
          </div>

          {/* Network Stats */}
          <div className="w-full max-w-6xl mx-auto">
            <div className="flex flex-wrap justify-center gap-6">
              <StatsCounter value={`${activeValidators}`} label="Active Validators" icon={Users} />
              <StatsCounter value={`${totalwebsites}`} label="Sites Monitored" icon={Server} />
              <StatsCounter value="99.97%" label="Network Uptime" icon={TrendingUp} />
              <StatsCounter value="24/7" label="Global Coverage" icon={Globe} />
            </div>
          </div>

          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
            <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center">
              <div className="w-1 h-3 bg-white/50 rounded-full mt-2 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced CSS Styles */}
      <style jsx>{`
        .perspective-1000 {
          perspective: 1000px;
        }
        
        .floating-3d-element {
          animation: float3d linear infinite;
          transform-style: preserve-3d;
        }
        
        .floating-cube {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(147, 51, 234, 0.4));
          border-radius: 8px;
          box-shadow: 0 0 30px rgba(59, 130, 246, 0.3);
        }
        
        .floating-pyramid {
          background: linear-gradient(135deg, rgba(6, 182, 212, 0.4), rgba(59, 130, 246, 0.4));
          clip-path: polygon(50% 0%, 0% 100%, 100% 100%);
          box-shadow: 0 0 30px rgba(6, 182, 212, 0.3);
        }
        
        .floating-octahedron {
          background: linear-gradient(135deg, rgba(147, 51, 234, 0.4), rgba(236, 72, 153, 0.4));
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          transform: rotate(45deg);
          box-shadow: 0 0 30px rgba(147, 51, 234, 0.3);
        }
        
        .floating-dodecahedron {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.4), rgba(6, 182, 212, 0.4));
          clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
          box-shadow: 0 0 30px rgba(16, 185, 129, 0.3);
        }
        
        .floating-icosahedron {
          background: linear-gradient(135deg, rgba(168, 85, 247, 0.4), rgba(59, 130, 246, 0.4));
          clip-path: polygon(50% 0%, 80% 10%, 100% 35%, 100% 70%, 80% 90%, 50% 100%, 20% 90%, 0% 70%, 0% 35%, 20% 10%);
          box-shadow: 0 0 30px rgba(168, 85, 247, 0.3);
        }
        
        .floating-torus {
          background: radial-gradient(circle at 30% 30%, rgba(236, 72, 153, 0.4), rgba(59, 130, 246, 0.4));
          border-radius: 50%;
          border: 8px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 30px rgba(236, 72, 153, 0.3);
        }
        
        .floating-blue { filter: hue-rotate(0deg) saturate(1.2); }
        .floating-purple { filter: hue-rotate(60deg) saturate(1.2); }
        .floating-cyan { filter: hue-rotate(120deg) saturate(1.2); }
        .floating-indigo { filter: hue-rotate(180deg) saturate(1.2); }
        .floating-violet { filter: hue-rotate(240deg) saturate(1.2); }
        .floating-pink { filter: hue-rotate(300deg) saturate(1.2); }
        
        @keyframes float3d {
          0% {
            transform: translateY(100vh) translateX(-50px) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(0.5);
            opacity: 0;
          }
          10% {
            opacity: 1;
            transform: translateY(90vh) translateX(-40px) rotateX(36deg) rotateY(36deg) rotateZ(36deg) scale(0.7);
          }
          50% {
            transform: translateY(50vh) translateX(0px) rotateX(180deg) rotateY(180deg) rotateZ(180deg) scale(1);
          }
          90% {
            opacity: 1;
            transform: translateY(10vh) translateX(40px) rotateX(324deg) rotateY(324deg) rotateZ(324deg) scale(0.7);
          }
          100% {
            transform: translateY(-10vh) translateX(50px) rotateX(360deg) rotateY(360deg) rotateZ(360deg) scale(0.5);
            opacity: 0;
          }
        }
        
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
        
        .glitch-text {
          position: relative;
          color: white;
          font-weight: 900;
        }
        
        .glitch-text::before,
        .glitch-text::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        
        .glitch-text::before {
          animation: glitch-anim-1 0.3s infinite linear alternate-reverse;
          color: #ff0040;
          z-index: -1;
        }
        
        .glitch-text::after {
          animation: glitch-anim-2 0.3s infinite linear alternate-reverse;
          color: #00ffff;
          z-index: -2;
        }
        
        @keyframes glitch-anim-1 {
          0% { clip: rect(42px, 9999px, 44px, 0); transform: skew(0.85deg); }
          5% { clip: rect(12px, 9999px, 59px, 0); transform: skew(0.4deg); }
          10% { clip: rect(48px, 9999px, 29px, 0); transform: skew(0.7deg); }
          15% { clip: rect(42px, 9999px, 73px, 0); transform: skew(0.1deg); }
          20% { clip: rect(63px, 9999px, 27px, 0); transform: skew(0.8deg); }
          25% { clip: rect(34px, 9999px, 55px, 0); transform: skew(0.2deg); }
          30% { clip: rect(86px, 9999px, 73px, 0); transform: skew(0.5deg); }
          35% { clip: rect(20px, 9999px, 20px, 0); transform: skew(1deg); }
          40% { clip: rect(26px, 9999px, 60px, 0); transform: skew(0.3deg); }
          45% { clip: rect(25px, 9999px, 66px, 0); transform: skew(0.6deg); }
          50% { clip: rect(57px, 9999px, 98px, 0); transform: skew(0.9deg); }
          55% { clip: rect(5px, 9999px, 46px, 0); transform: skew(0.15deg); }
          60% { clip: rect(82px, 9999px, 31px, 0); transform: skew(0.75deg); }
          65% { clip: rect(54px, 9999px, 27px, 0); transform: skew(0.25deg); }
          70% { clip: rect(28px, 9999px, 99px, 0); transform: skew(0.55deg); }
          75% { clip: rect(45px, 9999px, 69px, 0); transform: skew(0.95deg); }
          80% { clip: rect(23px, 9999px, 85px, 0); transform: skew(0.05deg); }
          85% { clip: rect(54px, 9999px, 84px, 0); transform: skew(0.65deg); }
          90% { clip: rect(45px, 9999px, 47px, 0); transform: skew(0.35deg); }
          95% { clip: rect(37px, 9999px, 20px, 0); transform: skew(0.85deg); }
          100% { clip: rect(4px, 9999px, 91px, 0); transform: skew(0.45deg); }
        }
        
        @keyframes glitch-anim-2 {
          0% { clip: rect(65px, 9999px, 100px, 0); transform: skew(0.45deg); }
          5% { clip: rect(52px, 9999px, 74px, 0); transform: skew(0.25deg); }
          10% { clip: rect(79px, 9999px, 85px, 0); transform: skew(0.65deg); }
          15% { clip: rect(31px, 9999px, 47px, 0); transform: skew(0.95deg); }
          20% { clip: rect(26px, 9999px, 40px, 0); transform: skew(0.15deg); }
          25% { clip: rect(75px, 9999px, 70px, 0); transform: skew(0.75deg); }
          30% { clip: rect(46px, 9999px, 50px, 0); transform: skew(0.05deg); }
          35% { clip: rect(14px, 9999px, 58px, 0); transform: skew(0.55deg); }
          40% { clip: rect(89px, 9999px, 32px, 0); transform: skew(0.85deg); }
          45% { clip: rect(2px, 9999px, 83px, 0); transform: skew(0.35deg); }
          50% { clip: rect(67px, 9999px, 22px, 0); transform: skew(0.8deg); }
          55% { clip: rect(86px, 9999px, 52px, 0); transform: skew(0.1deg); }
          60% { clip: rect(34px, 9999px, 90px, 0); transform: skew(0.7deg); }
          65% { clip: rect(50px, 9999px, 55px, 0); transform: skew(0.4deg); }
          70% { clip: rect(12px, 9999px, 32px, 0); transform: skew(0.9deg); }
          75% { clip: rect(53px, 9999px, 28px, 0); transform: skew(0.2deg); }
          80% { clip: rect(87px, 9999px, 91px, 0); transform: skew(0.6deg); }
          85% { clip: rect(38px, 9999px, 86px, 0); transform: skew(0.3deg); }
          90% { clip: rect(16px, 9999px, 100px, 0); transform: skew(1deg); }
          95% { clip: rect(29px, 9999px, 88px, 0); transform: skew(0.5deg); }
          100% { clip: rect(84px, 9999px, 92px, 0); transform: skew(0.95deg); }
        }
        
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in-up {
          animation: fade-in-up 1s ease-out;
        }
      `}</style>
    </div>
  );
}

export default GetStarted;
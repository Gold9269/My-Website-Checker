/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49'
        }
      },
      // combined animations (keeps your original names)
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        ping: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite',
        // note: this 'spin' overrides the built-in spin speed — kept from your original
        spin: 'spin 30s linear infinite',
        float: 'float 6s ease-in-out infinite',
        glow: 'glow 2s ease-in-out infinite alternate'
      },
      // custom keyframes for animations you added (pulse/ping/spin are built-in)
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' }
        },
        glow: {
          from: { boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)' },
          to: { boxShadow: '0 0 30px rgba(139, 92, 246, 0.6)' }
        }
      },
      // custom backdrop blur sizes
      backdropBlur: {
        xs: '2px'
      }
    }
  },
  plugins: []
};

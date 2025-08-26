// src/App.tsx
import React from 'react';
import { Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Tracker from './pages/Tracker';
import Validator from './pages/Validator';
import AutheticateValidator from './pages/AutheticateValidator';
import GetStarted from './pages/GetStarted';
import MusicComponent from './components/MusicComponent';
import { useTheme } from './hooks/ThemeContext';

function App() {
  // Now safe because ThemeProvider wraps App in index.tsx
  const { isDark } = useTheme();

  return (
    <div className="">
      <Routes>
        <Route path='/' element={<Dashboard />} />
        <Route path='/tracker' element={<Tracker/>} />
        <Route path='/validator' element={<Validator/>} />
        <Route path='/become-validator' element={<AutheticateValidator/>} />
        <Route path='/get-started' element={<GetStarted/>} />
      </Routes>

      {/* Mounted once at root — will not unmount on route change */}
      <MusicComponent isDark={isDark} />
    </div>
  );
}

export default App;

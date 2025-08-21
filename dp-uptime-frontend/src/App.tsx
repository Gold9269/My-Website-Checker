// src/App.tsx
import Dashboard from './pages/Dashboard';
import { Route, Routes } from 'react-router-dom';
import Tracker from './pages/Tracker';
import { ThemeProvider } from './hooks/ThemeContext';
import Validator from './pages/Validator';
import AutheticateValidator from './pages/AutheticateValidator';

function App() {
  return (
    <div className="">
      <Routes>
        <Route path='/' element={
          <ThemeProvider>
            <Dashboard />
          </ThemeProvider>
        }/>
        <Route path='/tracker' element={<Tracker/>}/>
        <Route path='/validator' element={<Validator/>}/>
        <Route path='/become-validator' element={<AutheticateValidator/>}/>
      </Routes>
    </div>
  );
}

export default App;

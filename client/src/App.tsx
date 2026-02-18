import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import SsePage from './pages/SsePage';
import StandardPage from './pages/StandardPage';

function App() {
  return (
    <BrowserRouter>
      <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
        <nav style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <NavLink
            to="/standard"
            style={({ isActive }) => ({
              padding: '8px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: 'white',
              backgroundColor: isActive ? '#007bff' : '#2c2f36',
            })}
          >
            Standard
          </NavLink>
          <NavLink
            to="/sse"
            style={({ isActive }) => ({
              padding: '8px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: 'white',
              backgroundColor: isActive ? '#007bff' : '#2c2f36',
            })}
          >
            SSE
          </NavLink>
        </nav>

        <Routes>
          <Route path="/" element={<StandardPage />} />
          <Route path="/standard" element={<StandardPage />} />
          <Route path="/sse" element={<SsePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

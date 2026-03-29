export function App() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <h1>📦 TCGPlayer Automation</h1>
      <p>Dashboard coming soon — Phase 1 MVP</p>
      <div style={{ marginTop: '1rem', padding: '1rem', background: '#f0f0f0', borderRadius: '8px' }}>
        <h3>System Status</h3>
        <ul>
          <li>Backend: <code>http://localhost:3000/health</code></li>
          <li>Price Source: TCGTracking API</li>
          <li>Seller Level: 1 (manual listing mode)</li>
        </ul>
      </div>
    </div>
  );
}

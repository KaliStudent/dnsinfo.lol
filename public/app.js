// DNS Intel API - Frontend JavaScript
const API_BASE = '/api/v1';

// DOM Elements
const searchInput = document.getElementById('domainInput');
const searchBtn = document.getElementById('searchBtn');
const resultsContainer = document.getElementById('results');
const heroSection = document.getElementById('hero');
const featuresSection = document.getElementById('features');

// State
let currentResults = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateRateLimitDisplay();
  setupEventListeners();
});

function setupEventListeners() {
  searchBtn.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  
  // Tab switching
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
      switchTab(e.target.dataset.tab);
    }
  });
}

async function updateRateLimitDisplay() {
  try {
    const res = await fetch(`${API_BASE}/rate-limit`);
    const data = await res.json();
    const limitEl = document.getElementById('rateLimit');
    if (limitEl) {
      limitEl.innerHTML = `<span>${data.remaining}</span> of ${data.limit} free lookups remaining today`;
    }
  } catch (e) {
    console.error('Failed to fetch rate limit:', e);
  }
}

async function performSearch() {
  const domain = searchInput.value.trim();
  if (!domain) {
    showError('Please enter a domain name');
    return;
  }
  
  // Show loading state
  searchBtn.disabled = true;
  searchBtn.innerHTML = '<span class="loading-spinner"></span> Scanning...';
  
  try {
    const res = await fetch(`${API_BASE}/scan/${encodeURIComponent(domain)}`);
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Scan failed');
    }
    
    currentResults = data;
    displayResults(data);
    
    // Update rate limit
    updateRateLimitDisplay();
    
  } catch (error) {
    showError(error.message);
  } finally {
    searchBtn.disabled = false;
    searchBtn.innerHTML = '🔍 Scan Domain';
  }
}

function displayResults(data) {
  heroSection.style.display = 'none';
  featuresSection.style.display = 'none';
  resultsContainer.classList.add('active');
  
  const grade = data.health?.grade || 'N/A';
  const score = data.health?.overallScore || 0;
  
  resultsContainer.innerHTML = `
    <div class="results-header">
      <div>
        <div class="results-domain">${data.domain}</div>
        <div style="color: var(--text-muted); margin-top: 0.5rem;">
          Scanned at ${new Date(data.timestamp).toLocaleString()}
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="text-align: right;">
          <div style="font-size: 0.875rem; color: var(--text-muted);">Health Score</div>
          <div style="font-size: 1.5rem; font-weight: 600;">${score}/100</div>
        </div>
        <div class="grade-badge grade-${grade}">${grade}</div>
      </div>
    </div>
    
    <button onclick="showHero()" style="margin-bottom: 2rem; padding: 0.5rem 1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-secondary); cursor: pointer;">
      ← New Search
    </button>
    
    <div class="results-tabs">
      <button class="tab-btn active" data-tab="dns">DNS Records</button>
      <button class="tab-btn" data-tab="propagation">Propagation</button>
      <button class="tab-btn" data-tab="health">Health Issues</button>
      <button class="tab-btn" data-tab="subdomains">Subdomains</button>
      <button class="tab-btn" data-tab="whois">WHOIS</button>
    </div>
    
    <div id="tab-dns" class="tab-content active">
      ${renderDNSRecords(data.health?.records || {})}
    </div>
    
    <div id="tab-propagation" class="tab-content">
      ${renderPropagation(data.propagation)}
    </div>
    
    <div id="tab-health" class="tab-content">
      ${renderHealthIssues(data.health?.issues || [])}
    </div>
    
    <div id="tab-subdomains" class="tab-content">
      ${renderSubdomains(data.subdomains)}
    </div>
    
    <div id="tab-whois" class="tab-content">
      ${renderWhois(data.whois)}
    </div>
  `;
}

function renderDNSRecords(records) {
  if (!records || Object.keys(records).length === 0) {
    return '<div class="result-card"><p style="color: var(--text-muted);">No DNS records found</p></div>';
  }
  
  let html = '';
  for (const [type, recs] of Object.entries(records)) {
    html += `
      <div class="result-card">
        <h4><span style="color: var(--accent-cyan)">${type}</span> Records (${recs.length})</h4>
        <table class="records-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>TTL</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${recs.map(r => `
              <tr>
                <td>${r.name}</td>
                <td>${r.TTL}s</td>
                <td style="word-break: break-all;">${escapeHtml(r.data)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  return html;
}

function renderPropagation(propagation) {
  if (!propagation || !propagation.results) {
    return '<div class="result-card"><p style="color: var(--text-muted);">No propagation data available</p></div>';
  }
  
  const analysis = propagation.analysis || {};
  
  return `
    <div class="result-card">
      <h4>Propagation Analysis</h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; text-align: center;">
          <div style="font-size: 2rem; font-weight: 700; color: ${analysis.propagated ? 'var(--accent-green)' : 'var(--accent-yellow)'}">${analysis.percentage || 0}%</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Propagated</div>
        </div>
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; text-align: center;">
          <div style="font-size: 2rem; font-weight: 700;">${propagation.results.filter(r => r.status === 'success').length}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Resolvers OK</div>
        </div>
        <div style="background: var(--bg-secondary); padding: 1rem; border-radius: 8px; text-align: center;">
          <div style="font-size: 2rem; font-weight: 700; color: ${analysis.consistentRecords ? 'var(--accent-green)' : 'var(--accent-yellow)'}">${analysis.consistentRecords ? '✓' : '!'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Consistent</div>
        </div>
      </div>
      <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">${analysis.summary || ''}</p>
      <div class="propagation-grid">
        ${propagation.results.map(r => `
          <div class="propagation-card">
            <div style="display: flex; justify-content: space-between; align-items: start;">
              <h5>${r.resolver}</h5>
              <span class="status-badge status-${r.status === 'success' ? 'success' : 'error'}">${r.status}</span>
            </div>
            <div class="region">${r.region} • ${r.location}</div>
            ${r.response?.answer?.[0]?.data ? `<div style="font-family: monospace; font-size: 0.75rem; margin-top: 0.5rem; color: var(--text-primary);">${r.response.answer[0].data}</div>` : ''}
            <div class="latency">${r.latencyMs}ms</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderHealthIssues(issues) {
  if (!issues || issues.length === 0) {
    return `
      <div class="result-card">
        <h4>✅ No Issues Found</h4>
        <p style="color: var(--text-secondary);">Your DNS configuration looks healthy!</p>
      </div>
    `;
  }
  
  const grouped = {
    critical: issues.filter(i => i.severity === 'critical'),
    warning: issues.filter(i => i.severity === 'warning'),
    info: issues.filter(i => i.severity === 'info')
  };
  
  return `
    <div class="result-card">
      <h4>Health Issues (${issues.length})</h4>
      <ul class="issues-list">
        ${issues.map(issue => `
          <li class="issue-item issue-${issue.severity}">
            <div>
              <span style="font-weight: 600;">${issue.severity.toUpperCase()}</span>
              <span style="color: var(--text-muted); margin-left: 0.5rem;">${issue.category}</span>
            </div>
            <div style="flex: 1;">
              <div>${issue.message}</div>
              ${issue.recommendation ? `<div style="color: var(--text-muted); font-size: 0.875rem; margin-top: 0.5rem;">💡 ${issue.recommendation}</div>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderSubdomains(subdomains) {
  if (!subdomains || !subdomains.subdomains || subdomains.subdomains.length === 0) {
    return '<div class="result-card"><p style="color: var(--text-muted);">No subdomains found</p></div>';
  }
  
  return `
    <div class="result-card">
      <h4>Subdomains Found (${subdomains.totalFound})</h4>
      <div style="display: flex; gap: 1rem; margin-bottom: 1rem; font-size: 0.875rem; color: var(--text-muted);">
        <span>📜 CT Logs: ${subdomains.sources?.certificateTransparency || 0}</span>
        <span>🔍 Common: ${subdomains.sources?.commonSubdomains || 0}</span>
      </div>
      <table class="records-table">
        <thead>
          <tr>
            <th>Subdomain</th>
            <th>Resolves</th>
            <th>SSL</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${subdomains.subdomains.slice(0, 50).map(s => `
            <tr>
              <td>${s.fullDomain}</td>
              <td><span class="status-badge status-${s.resolves ? 'success' : 'error'}">${s.resolves ? '✓' : '✗'}</span></td>
              <td><span class="status-badge status-${s.hasSSL ? 'success' : 'warning'}">${s.hasSSL ? '🔒' : '⚠️'}</span></td>
              <td style="font-size: 0.75rem; color: var(--text-muted);">${s.source}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${subdomains.totalFound > 50 ? `<p style="color: var(--text-muted); margin-top: 1rem; font-size: 0.875rem;">Showing 50 of ${subdomains.totalFound} subdomains</p>` : ''}
    </div>
  `;
}

function renderWhois(whois) {
  if (!whois) {
    return '<div class="result-card"><p style="color: var(--text-muted);">No WHOIS data available</p></div>';
  }
  
  return `
    <div class="result-card">
      <h4>WHOIS Information ${whois.privacyEnabled ? '<span class="status-badge status-info">🔒 Privacy Protected</span>' : ''}</h4>
      ${whois.summary ? `<p style="color: var(--text-secondary); margin-bottom: 1rem;">${whois.summary}</p>` : ''}
      <table class="records-table">
        <tbody>
          ${whois.registrar?.name ? `<tr><td style="color: var(--text-muted);">Registrar</td><td>${whois.registrar.name}</td></tr>` : ''}
          ${whois.dates?.created ? `<tr><td style="color: var(--text-muted);">Created</td><td>${new Date(whois.dates.created).toLocaleDateString()}</td></tr>` : ''}
          ${whois.dates?.expires ? `<tr><td style="color: var(--text-muted);">Expires</td><td>${new Date(whois.dates.expires).toLocaleDateString()}</td></tr>` : ''}
          ${whois.dates?.updated ? `<tr><td style="color: var(--text-muted);">Updated</td><td>${new Date(whois.dates.updated).toLocaleDateString()}</td></tr>` : ''}
          ${whois.nameservers?.length ? `<tr><td style="color: var(--text-muted);">Nameservers</td><td>${whois.nameservers.join('<br>')}</td></tr>` : ''}
          ${whois.dnssec ? `<tr><td style="color: var(--text-muted);">DNSSEC</td><td>${whois.dnssec}</td></tr>` : ''}
          ${whois.status?.length ? `<tr><td style="color: var(--text-muted);">Status</td><td>${whois.status.join('<br>')}</td></tr>` : ''}
        </tbody>
      </table>
    </div>
  `;
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
}

function showHero() {
  heroSection.style.display = 'block';
  featuresSection.style.display = 'block';
  resultsContainer.classList.remove('active');
  searchInput.value = '';
}

function showError(message) {
  alert(message); // Simple error handling, can be improved
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

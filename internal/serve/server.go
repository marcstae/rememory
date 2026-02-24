package serve

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/eljojo/rememory/internal/core"
)

// Config holds the configuration for the server.
type Config struct {
	Host            string
	Port            string
	DataDir         string
	MaxManifestSize int  // Maximum MANIFEST.age size in bytes
	NoTlock         bool // Omit time-lock support
	Version         string
}

// Server implements http.Handler for the self-hosted ReMemory web app.
type Server struct {
	store           *Store
	maxManifestSize int
	noTlock         bool
	version         string
	githubURL       string
	mux             *http.ServeMux
}

// New creates a new Server from the given config.
func New(cfg Config) (*Server, error) {
	store, err := NewStore(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("initializing store: %w", err)
	}

	var githubURL string
	if strings.HasPrefix(cfg.Version, "v") {
		githubURL = fmt.Sprintf("%s/releases/tag/%s", core.GitHubRepo, cfg.Version)
	} else {
		githubURL = core.GitHubRepo + "/releases/latest"
	}

	s := &Server{
		store:           store,
		maxManifestSize: cfg.MaxManifestSize,
		noTlock:         cfg.NoTlock,
		version:         cfg.Version,
		githubURL:       githubURL,
		mux:             http.NewServeMux(),
	}

	s.routes()
	return s, nil
}

// routes registers all HTTP routes.
func (s *Server) routes() {
	// Pages
	s.mux.HandleFunc("GET /", s.handleRoot)
	s.mux.HandleFunc("GET /create", s.handleCreate)
	s.mux.HandleFunc("GET /recover", s.handleRecover)
	s.mux.HandleFunc("GET /about", s.handleAbout)
	s.mux.HandleFunc("GET /docs", s.handleDocs)

	// Redirect .html paths to clean routes (docs content links to these)
	for _, r := range [][2]string{
		{"/index.html", "/about"},
		{"/maker.html", "/create"},
		{"/recover.html", "/recover"},
		{"/docs.html", "/docs"},
	} {
		from, to := r[0], r[1]
		s.mux.HandleFunc("GET "+from, func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, to, http.StatusMovedPermanently)
		})
	}

	// API
	s.mux.HandleFunc("GET /api/status", s.handleAPIStatus)
	s.mux.HandleFunc("POST /api/setup", s.handleAPISetup)
	s.mux.HandleFunc("GET /api/bundles", s.handleAPIListBundles)
	s.mux.HandleFunc("POST /api/bundle", s.handleAPISaveBundle)
	s.mux.HandleFunc("DELETE /api/bundle", s.handleAPIDeleteBundle)
	s.mux.HandleFunc("GET /api/bundle/manifest", s.handleAPIManifest)
}

// ServeHTTP implements http.Handler.
func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s)
}

// Store returns the server's store (for testing).
func (s *Server) Store() *Store {
	return s.store
}

// generateSetupHTML creates a simple setup page for setting the admin password.
func (s *Server) generateSetupHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReMemory — Setup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: #f5f5f5;
      color: #2E2A26;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .setup-card {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 2rem;
      max-width: 400px;
      width: 100%;
    }
    h1 {
      font-size: 1.25rem;
      margin-bottom: 0.5rem;
    }
    p {
      color: #6B6560;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.375rem;
    }
    input[type="password"] {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #55735A;
      box-shadow: 0 0 0 2px rgba(85, 115, 90, 0.2);
    }
    button {
      width: 100%;
      padding: 0.625rem;
      background: #55735A;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #466B4A; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .error { color: #c44; font-size: 0.8125rem; margin-top: 0.5rem; }
    .hint { color: #8A8480; font-size: 0.8125rem; margin-top: 1rem; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="setup-card">
    <h1>Set up ReMemory</h1>
    <p>Choose an admin password. You'll need it to delete bundles from this server.</p>
    <form id="setup-form">
      <label for="password">Admin password</label>
      <input type="password" id="password" name="password" required autocomplete="new-password">
      <label for="confirm">Confirm password</label>
      <input type="password" id="confirm" name="confirm" required autocomplete="new-password">
      <button type="submit">Set password</button>
      <div id="error" class="error"></div>
    </form>
    <p class="hint">This password protects administrative actions only. Your encrypted archives are secured by age encryption and Shamir's Secret Sharing.</p>
  </div>
  <script>
    document.getElementById('setup-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      const pw = document.getElementById('password').value;
      const confirm = document.getElementById('confirm').value;
      const errorEl = document.getElementById('error');
      errorEl.textContent = '';

      if (pw !== confirm) {
        errorEl.textContent = 'Passwords do not match.';
        return;
      }
      if (pw.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        return;
      }

      const btn = this.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Setting up...';

      try {
        const resp = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pw }),
        });
        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || 'Setup failed.');
        }
        window.location.href = '/';
      } catch (err) {
        errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Set password';
      }
    });
  </script>
</body>
</html>`
}

// generateHomeHTML creates the home page with bundle data embedded as JSON.
func (s *Server) generateHomeHTML() string {
	bundles, _ := s.store.List()
	if bundles == nil {
		bundles = []BundleMeta{}
	}
	bundlesJSON, _ := json.Marshal(bundles)

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ReMemory</title>
  <style>
    :root {
      --paper: #f5f5f5;
      --paper-light: #ffffff;
      --text: #2E2A26;
      --text-secondary: #6B6560;
      --text-muted: #766E6A;
      --sage: #55735A;
      --sage-dark: #466B4A;
      --sage-light: #E8F2EA;
      --sage-tint: #E8EFEA;
      --sand: #f0f0ee;
      --dusty-blue: #6B819A;
      --dusty-blue-dark: #56708A;
      --border: #ddd;
      --border-light: #eee;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: var(--text);
      background: var(--paper);
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
    :focus-visible {
      outline: 2px solid var(--sage);
      outline-offset: 2px;
      box-shadow: 0 0 0 4px rgba(85, 115, 90, 0.2);
    }

    /* Nav — matches maker.html / recover.html */
    .site-nav {
      background: var(--paper-light);
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(46,42,38,0.08);
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .site-nav .logo {
      font-size: 1.25rem;
      font-weight: bold;
      color: var(--text);
      text-decoration: none;
    }
    .site-nav .nav-links {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-left: auto;
    }
    .site-nav .nav-links a {
      color: var(--dusty-blue);
      text-decoration: none;
      font-size: 0.95rem;
    }
    .site-nav .nav-links a:hover { text-decoration: underline; }

    /* Page intro */
    .page-intro {
      background: var(--paper-light);
      border-radius: 8px;
      padding: 1.25rem 2rem;
      box-shadow: 0 2px 4px rgba(46,42,38,0.08);
      margin-bottom: 1.5rem;
    }
    .page-intro p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      line-height: 1.6;
    }
    .page-intro a {
      color: var(--dusty-blue);
      text-decoration: none;
    }
    .page-intro a:hover { text-decoration: underline; }

    /* Empty state */
    .empty-state {
      background: var(--paper-light);
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(46,42,38,0.08);
      padding: 2.5rem 2rem;
      text-align: center;
    }
    .empty-state p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 1.25rem;
      line-height: 1.6;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--sage);
      color: var(--paper-light);
    }
    .btn-primary:hover { background: var(--sage-dark); }

    /* Bundle cards — styled like .card on other pages */
    .bundle-card {
      background: var(--paper-light);
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(46,42,38,0.08);
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .bundle-card .bundle-date {
      font-weight: 600;
      font-size: 1.1rem;
      color: var(--text);
      margin-bottom: 0.375rem;
    }
    .bundle-card .bundle-meta {
      color: var(--text-secondary);
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    .bundle-card .bundle-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .bundle-card .bundle-actions a {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--sage);
      color: var(--paper-light);
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      transition: all 0.2s;
    }
    .bundle-card .bundle-actions a:hover { background: var(--sage-dark); }
    .delete-toggle {
      background: none;
      border: none;
      color: var(--text-muted);
      font-size: 0.8125rem;
      cursor: pointer;
      padding: 0.5rem 0;
    }
    .delete-toggle:hover { color: var(--text-secondary); }
    .delete-form {
      display: none;
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-light);
    }
    .delete-form.visible { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .delete-form input[type="password"] {
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.875rem;
      width: 14rem;
    }
    .delete-form input[type="password"]:focus {
      outline: none;
      border-color: var(--sage);
      box-shadow: 0 0 0 2px rgba(85, 115, 90, 0.2);
    }
    .delete-form button {
      padding: 0.375rem 0.75rem;
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-secondary);
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .delete-form button:hover { border-color: #c44; color: #c44; }
    .delete-form button:disabled { opacity: 0.6; cursor: not-allowed; }
    .delete-error {
      color: #c44;
      font-size: 0.8125rem;
      width: 100%;
      margin-top: 0.25rem;
    }

    /* Footer — matches other pages */
    footer {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }
    footer a {
      color: var(--dusty-blue);
      text-decoration: none;
    }
    footer a:hover { text-decoration: underline; }
    footer .version {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    @media (max-width: 600px) {
      .container { padding: 1rem; }
      .site-nav { flex-direction: column; text-align: center; }
      .site-nav .nav-links { margin-left: 0; }
      .bundle-card { padding: 1rem; }
      .delete-form input[type="password"] { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="container">
    <nav class="site-nav">
      <a href="/" class="logo">&#129504; ReMemory</a>
      <div class="nav-links">
        <a href="/create">Create</a>
        <a href="/recover">Recover</a>
        <a href="/docs">Guide</a>
        <a href="/about">About</a>
      </div>
    </nav>
    <div class="page-intro">
      <p>Files protected by people you trust, stored here for when they're needed. <a href="/about">About ReMemory</a></p>
    </div>
    <div id="content"></div>
    <footer>
      <p>ReMemory</p>
      <p class="version">` + s.version + `</p>
    </footer>
  </div>
  <script>
    var BUNDLES = ` + string(bundlesJSON) + `;

    function formatDate(iso) {
      try {
        var d = new Date(iso);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      } catch { return iso; }
    }

    function escapeHtml(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function render() {
      var el = document.getElementById('content');
      if (BUNDLES.length === 0) {
        el.innerHTML =
          '<div class="empty-state">' +
            '<p>No recovery bundles here yet.</p>' +
            '<a href="/create" class="btn btn-primary">Create a bundle</a>' +
          '</div>';
        return;
      }

      var html = '';
      BUNDLES.forEach(function(b) {
        html +=
          '<div class="bundle-card" data-id="' + escapeHtml(b.id) + '">' +
            '<div class="bundle-date">' + formatDate(b.created) + '</div>' +
            '<div class="bundle-meta">' +
              b.threshold + ' of ' + b.total + ' pieces needed to recover' +
            '</div>' +
            '<div class="bundle-actions">' +
              '<a href="/recover?id=' + encodeURIComponent(b.id) + '">Recover</a>' +
              '<button type="button" class="delete-toggle" onclick="toggleDelete(this)">Delete</button>' +
            '</div>' +
            '<div class="delete-form">' +
              '<input type="password" placeholder="Admin password" class="delete-password">' +
              '<button type="button" onclick="deleteBundle(this)" class="delete-btn">Confirm</button>' +
              '<div class="delete-error"></div>' +
            '</div>' +
          '</div>';
      });
      el.innerHTML = html;
    }

    function toggleDelete(btn) {
      var card = btn.closest('.bundle-card');
      var form = card.querySelector('.delete-form');
      form.classList.toggle('visible');
      if (form.classList.contains('visible')) {
        form.querySelector('.delete-password').focus();
      }
    }

    function deleteBundle(btn) {
      var card = btn.closest('.bundle-card');
      var id = card.dataset.id;
      var password = card.querySelector('.delete-password').value;
      var errorEl = card.querySelector('.delete-error');

      if (!password) {
        errorEl.textContent = 'Enter the admin password.';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Deleting...';
      errorEl.textContent = '';

      fetch('/api/bundle', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, password: password }),
      })
      .then(function(resp) {
        if (!resp.ok) return resp.text().then(function(t) { throw new Error(t || 'Delete failed.'); });
        BUNDLES = BUNDLES.filter(function(b) { return b.id !== id; });
        render();
      })
      .catch(function(err) {
        errorEl.textContent = err.message;
        btn.disabled = false;
        btn.textContent = 'Confirm';
      });
    }

    render();
  </script>
</body>
</html>`
}

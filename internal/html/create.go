package html

import (
	"encoding/json"
	"strings"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/translations"
)

// tlockTabsHTML is the Simple/Advanced tab switcher injected into maker.html step 3.
const tlockTabsHTML = `<span id="advanced-options" class="mode-tabs hidden">
          <button type="button" class="mode-tab active" data-mode="simple" data-i18n="mode_simple">Simple</button>
          <button type="button" class="mode-tab" data-mode="advanced" data-i18n="mode_advanced">Advanced</button>
        </span>`

// tlockPanelHTML is the time-lock options panel injected into maker.html step 3.
const tlockPanelHTML = `<!-- Advanced: time lock (shown when Advanced tab is active) -->
      <div id="timelock-panel" class="hidden" style="margin-bottom: 1rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; margin: 0;">
            <input type="checkbox" id="timelock-checkbox">
            <span data-i18n="timelock_label">Add a time lock</span>
            <span style="font-size: 0.75rem; color: #8A8480; background: #f0f0ee; padding: 0.125rem 0.5rem; border-radius: 3px;" data-i18n="timelock_experimental">experimental</span>
          </label>
          <div id="timelock-options" class="hidden" style="display: flex; align-items: center; gap: 0.5rem;">
            <input type="number" id="timelock-value" min="1" value="30" style="width: 5rem; padding: 0.375rem; border: 1px solid #ddd; border-radius: 4px;">
            <select id="timelock-unit" style="padding: 0.375rem; border: 1px solid #ddd; border-radius: 4px;">
              <option value="min" data-i18n="timelock_minutes">minutes</option>
              <option value="h" data-i18n="timelock_hours">hours</option>
              <option value="d" selected data-i18n="timelock_days">days</option>
              <option value="w" data-i18n="timelock_weeks">weeks</option>
              <option value="m" data-i18n="timelock_months">months</option>
              <option value="y" data-i18n="timelock_years">years</option>
            </select>
          </div>
        </div>
        <div id="timelock-details" class="hidden" style="margin-top: 0.5rem;">
          <p id="timelock-date-preview" style="margin: 0; font-size: 0.875rem; color: #6B6560;"></p>
          <p style="margin: 0.25rem 0 0; font-size: 0.8125rem; color: #8A8480;"><span data-i18n="timelock_hint">Even with enough pieces, the files stay locked until this date.</span> <a href="{{GITHUB_PAGES}}/docs#timelock" target="_blank" style="color: #7A8FA6;" data-i18n="timelock_learn_more">How does this work?</a></p>
          <p style="margin: 0.25rem 0 0; font-size: 0.8125rem; color: #8A8480;" data-i18n="timelock_network_hint">Recovery will need a brief internet connection to verify the time lock.</p>
        </div>
      </div>`

// MakerHTMLOptions holds optional parameters for GenerateMakerHTML.
type MakerHTMLOptions struct {
	NoTlock          bool              // Omit tlock-js from the maker (disables time-lock UI)
	Selfhosted       bool              // Use selfhosted JS variant with server integration
	SelfhostedConfig *SelfhostedConfig // Config injected into the HTML for selfhosted mode
}

// SelfhostedConfig holds configuration passed to the selfhosted frontend.
type SelfhostedConfig struct {
	MaxManifestSize int  `json:"maxManifestSize"` // Maximum MANIFEST.age size the server accepts
	HasManifest     bool `json:"hasManifest"`     // Whether a manifest currently exists on the server
}

// GenerateMakerHTML creates the complete maker.html with all assets embedded.
// createWASMBytes is the create.wasm binary (runs in browser for bundle creation).
// Note: recover.html uses native JavaScript crypto, not WASM.
// version is the rememory version string.
// githubURL is the URL to download CLI binaries.
func GenerateMakerHTML(createWASMBytes []byte, version, githubURL string, opts MakerHTMLOptions) string {
	html := makerHTMLTemplate

	// Embed translations
	html = strings.Replace(html, "{{TRANSLATIONS}}", translations.GetTranslationsJS("maker"), 1)

	// Embed language picker (generated from translations.LangNames)
	html = strings.Replace(html, "{{LANG_OPTIONS}}", translations.LangSelectOptions(), 1)
	html = strings.Replace(html, "{{LANG_DETECT}}", translations.LangDetectJS(), 1)

	// Embed styles
	html = strings.Replace(html, "{{STYLES}}", stylesCSS, 1)

	// Embed wasm_exec.js
	html = strings.Replace(html, "{{WASM_EXEC}}", wasmExecJS, 1)

	// Embed shared.js + create-app.js (selfhosted variant when applicable)
	appScript := createAppJS
	if opts.Selfhosted {
		appScript = createAppSelfhostedJS
	}
	html = strings.Replace(html, "{{CREATE_APP_JS}}", sharedJS+"\n"+appScript, 1)

	// Embed selfhosted config (or empty)
	if opts.Selfhosted && opts.SelfhostedConfig != nil {
		configJSON, _ := json.Marshal(opts.SelfhostedConfig)
		html = strings.Replace(html, "{{SELFHOSTED_CONFIG}}", string(configJSON), 1)
	} else {
		html = strings.Replace(html, "{{SELFHOSTED_CONFIG}}", "null", 1)
	}

	// Include tlock-create.js and tlock UI unless explicitly disabled
	noTlock := opts.NoTlock
	cspConnectSrc := "blob:"
	if !noTlock {
		html = strings.Replace(html, "{{TLOCK_JS}}",
			drandConfigScript()+`<script nonce="{{CSP_NONCE}}">`+tlockCreateJS+`</script>`, 1)
		cspConnectSrc = drandCSPConnectSrc()
		html = strings.Replace(html, "{{TLOCK_TABS_HTML}}", tlockTabsHTML, 1)
		html = strings.Replace(html, "{{TLOCK_PANEL_HTML}}", tlockPanelHTML, 1)
	} else {
		html = strings.Replace(html, "{{TLOCK_JS}}", "", 1)
		html = strings.Replace(html, "{{TLOCK_TABS_HTML}}", "", 1)
		html = strings.Replace(html, "{{TLOCK_PANEL_HTML}}", "", 1)
	}

	// Selfhosted mode needs 'self' for fetch to /api/*
	if opts.Selfhosted {
		cspConnectSrc += " 'self'"
	}
	html = strings.Replace(html, "{{CSP_CONNECT_SRC}}", cspConnectSrc, 1)

	// Embed create.wasm as gzip-compressed base64 (this runs in the browser)
	createWASMB64 := compressAndEncode(createWASMBytes)
	html = strings.Replace(html, "{{WASM_BASE64}}", createWASMB64, 1)

	// Replace version and GitHub URLs
	html = strings.Replace(html, "{{VERSION}}", version, -1)
	html = strings.Replace(html, "{{GITHUB_REPO}}", core.GitHubRepo, -1)
	html = strings.Replace(html, "{{GITHUB_PAGES}}", core.GitHubPages, -1)
	html = strings.Replace(html, "{{GITHUB_URL}}", githubURL, -1)

	// Selfhosted mode: rewrite nav links to server routes
	if opts.Selfhosted {
		html = strings.Replace(html, `href="index.html" class="logo"`, `href="/" class="logo"`, -1)
		html = strings.Replace(html, `href="index.html" data-i18n="nav_about"`, `href="/about" data-i18n="nav_about"`, -1)
		html = strings.Replace(html, `href="maker.html"`, `href="/create"`, -1)
		html = strings.Replace(html, `href="recover.html"`, `href="/recover"`, -1)
		html = strings.Replace(html, `href="docs.html"`, `href="/docs"`, -1)
		html = strings.Replace(html, `<a href="`+core.GitHubRepo+`" target="_blank">GitHub</a>`, "", -1)
	}

	// Apply CSP nonce to all script tags
	html = applyCSPNonce(html)

	return html
}

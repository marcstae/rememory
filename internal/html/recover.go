package html

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/translations"
)

// FriendInfo holds friend contact information for the UI.
type FriendInfo struct {
	Name       string `json:"name"`
	Contact    string `json:"contact,omitempty"`
	ShareIndex int    `json:"shareIndex"` // 1-based share index for this friend
}

// MaxEmbeddedManifestSize is the maximum size of MANIFEST.age that will be
// embedded (base64-encoded) in recover.html. Manifests at or below this size
// are included so recovery can work without the separate MANIFEST.age file.
const MaxEmbeddedManifestSize = 10 << 20 // 10 MiB

// PersonalizationData holds the data to personalize recover.html for a specific friend.
type PersonalizationData struct {
	Holder       string       `json:"holder"`                 // This friend's name
	HolderShare  string       `json:"holderShare"`            // This friend's encoded share
	OtherFriends []FriendInfo `json:"otherFriends"`           // List of other friends
	Threshold    int          `json:"threshold"`              // Required shares (K)
	Total        int          `json:"total"`                  // Total shares (N)
	Language     string       `json:"language,omitempty"`     // Default UI language for this friend
	ManifestB64  string       `json:"manifestB64,omitempty"`  // Base64-encoded MANIFEST.age (when <= MaxEmbeddedManifestSize)
	TlockEnabled bool         `json:"tlockEnabled,omitempty"` // Signals tlock-js should be included
}

// tlockWaitingHTML is the time-lock waiting UI injected into recover.html.
// Includes inline CSS so the styles are zero-trace when tlock is disabled.
const tlockWaitingHTML = `<style>
.tlock-waiting {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.25rem;
  background: var(--sage-tint);
  border-radius: 6px;
  margin-bottom: 1rem;
}
.tlock-waiting-icon {
  font-size: 1.75rem;
  line-height: 1;
  flex-shrink: 0;
}
.tlock-waiting-body {
  flex: 1;
}
.tlock-waiting-body > strong {
  display: block;
  color: var(--text);
  margin-bottom: 0.25rem;
}
.tlock-waiting-body p {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}
.tlock-waiting-hint {
  color: var(--text-muted) !important;
  font-size: 0.8125rem !important;
}
.tlock-waiting-hint a {
  color: var(--text-muted);
  text-decoration: none;
}
.tlock-waiting-hint a:hover {
  color: var(--text-secondary);
  text-decoration: underline;
}
</style>
      <div id="tlock-waiting" class="tlock-waiting hidden" aria-live="polite">
        <div class="tlock-waiting-icon">&#128336;</div>
        <div class="tlock-waiting-body">
          <strong id="tlock-waiting-title" data-i18n="tlock_waiting_title">Time lock active</strong>
          <p id="tlock-waiting-date"></p>
          <p class="tlock-waiting-hint"><a href="{{GITHUB_PAGES}}/docs#timelock" target="_blank" data-i18n="tlock_learn_more">What is this?</a></p>
        </div>
      </div>`

// RecoverHTMLOptions holds optional parameters for GenerateRecoverHTML.
type RecoverHTMLOptions struct {
	NoTlock          bool              // Omit tlock-js even from generic recover.html
	Selfhosted       bool              // Use selfhosted JS variant with server integration
	SelfhostedConfig *SelfhostedConfig // Config injected into the HTML for selfhosted mode
}

// GenerateRecoverHTML creates the complete recover.html with all assets embedded.
// Uses native JavaScript crypto (no WASM required).
// version is the rememory version string.
// githubURL is the URL to download CLI binaries.
// personalization can be nil for a generic recover.html, or provided to personalize for a specific friend.
func GenerateRecoverHTML(version, githubURL string, personalization *PersonalizationData, opts ...RecoverHTMLOptions) string {
	html := recoverHTMLTemplate

	// Embed translations
	html = strings.Replace(html, "{{TRANSLATIONS}}", translations.GetTranslationsJS("recover"), 1)

	// Embed README basenames for ZIP extraction
	readmeNames, _ := json.Marshal(translations.ReadmeBasenames())
	html = strings.Replace(html, "{{README_NAMES}}", string(readmeNames), 1)

	// Embed language picker (generated from translations.LangNames)
	html = strings.Replace(html, "{{LANG_OPTIONS}}", translations.LangSelectOptions(), 1)
	html = strings.Replace(html, "{{LANG_DETECT}}", translations.LangDetectJS(), 1)

	// Embed styles
	html = strings.Replace(html, "{{STYLES}}", stylesCSS, 1)

	// Embed shared.js + app.js (selfhosted variant when applicable)
	var appScript string
	var selfhosted bool
	if len(opts) > 0 {
		selfhosted = opts[0].Selfhosted
	}
	if selfhosted {
		appScript = appSelfhostedJS
	} else {
		appScript = appJS
	}
	html = strings.Replace(html, "{{APP_JS}}", sharedJS+"\n"+appScript, 1)

	// Embed selfhosted config (or null)
	if selfhosted && len(opts) > 0 && opts[0].SelfhostedConfig != nil {
		configJSON, _ := json.Marshal(opts[0].SelfhostedConfig)
		html = strings.Replace(html, "{{SELFHOSTED_CONFIG}}", string(configJSON), 1)
	} else {
		html = strings.Replace(html, "{{SELFHOSTED_CONFIG}}", "null", 1)
	}

	// Include tlock.js when needed:
	// - Generic/standalone recover.html (personalization == nil): always include so
	//   GitHub Pages can handle tlock manifests
	// - Personalized tlock bundle: include for time-lock decryption
	// - Personalized non-tlock bundle: omit to keep size small
	var noTlock bool
	if len(opts) > 0 {
		noTlock = opts[0].NoTlock
	}
	// If personalization requires tlock, always include it regardless of noTlock
	if noTlock && personalization != nil && personalization.TlockEnabled {
		fmt.Fprintf(os.Stderr, "Warning: --no-timelock ignored for tlock-enabled bundle\n")
		noTlock = false
	}
	includeTlock := !noTlock && (personalization == nil || personalization.TlockEnabled)
	var cspConnectSrc string
	if includeTlock {
		html = strings.Replace(html, "{{TLOCK_JS}}",
			drandConfigScript()+`<script nonce="{{CSP_NONCE}}">`+tlockRecoverJS+`</script>`, 1)
		cspConnectSrc = drandCSPConnectSrc()
		html = strings.Replace(html, "{{TLOCK_WAITING_HTML}}", tlockWaitingHTML, 1)
	} else {
		html = strings.Replace(html, "{{TLOCK_JS}}", "", 1)
		cspConnectSrc = "blob:"
		html = strings.Replace(html, "{{TLOCK_WAITING_HTML}}", "", 1)
	}
	// Selfhosted mode needs 'self' for fetch to /api/*
	if selfhosted {
		cspConnectSrc += " 'self'"
	}
	html = strings.Replace(html, "{{CSP_CONNECT_SRC}}", cspConnectSrc, 1)

	// Replace version and GitHub URLs
	html = strings.Replace(html, "{{VERSION}}", version, -1)
	html = strings.Replace(html, "{{GITHUB_REPO}}", core.GitHubRepo, -1)
	html = strings.Replace(html, "{{GITHUB_PAGES}}", core.GitHubPages, -1)
	html = strings.Replace(html, "{{GITHUB_URL}}", githubURL, -1)

	// Embed personalization data as JSON (or null if not provided)
	var personalizationJSON string
	if personalization != nil {
		data, _ := json.Marshal(personalization)
		personalizationJSON = string(data)
	} else {
		personalizationJSON = "null"
	}
	html = strings.Replace(html, "{{PERSONALIZATION_DATA}}", personalizationJSON, 1)

	// Selfhosted mode: rewrite nav links to server routes
	if selfhosted {
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

// compressAndEncode gzip-compresses data and returns base64-encoded result.
// This reduces WASM size by ~70% in the embedded HTML.
func compressAndEncode(data []byte) string {
	var buf bytes.Buffer
	gz, err := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if err != nil {
		panic("gzip.NewWriterLevel: " + err.Error())
	}
	if _, err := gz.Write(data); err != nil {
		panic("gzip.Write: " + err.Error())
	}
	if err := gz.Close(); err != nil {
		panic("gzip.Close: " + err.Error())
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes())
}

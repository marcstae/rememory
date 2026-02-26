package html

import (
	"strings"

	"github.com/eljojo/rememory/internal/core"
)

// LayoutOptions holds the parameters for assembling a page from the shared layout.
type LayoutOptions struct {
	Title           string // Page <title>
	BodyClass       string // Optional body class (e.g. "setup" to hide nav)
	HeadMeta        string // Extra <head> content (CSP, OG tags, etc.)
	PageStyles      string // Page-specific CSS (injected after shared styles)
	NavExtras       string // Extra nav content (e.g. language selector)
	BeforeContainer string // Content before the .container div (e.g. toast container, modals)
	Content         string // Page-specific HTML inside .container
	FooterContent   string // Footer inner HTML
	Scripts         string // Page-specific <script> tags
	Selfhosted      bool   // Selfhosted mode: logo links to "/" instead of "about.html"
}

// applyLayout assembles a full HTML page from the shared layout template.
func applyLayout(opts LayoutOptions) string {
	html := layoutHTMLTemplate

	html = strings.Replace(html, "{{TITLE}}", opts.Title, 1)
	html = strings.Replace(html, "{{BODY_CLASS}}", opts.BodyClass, 1)
	html = strings.Replace(html, "{{HEAD_META}}", opts.HeadMeta, 1)
	html = strings.Replace(html, "{{STYLES}}", stylesCSS, 1)
	html = strings.Replace(html, "{{PAGE_STYLES}}", opts.PageStyles, 1)
	html = strings.Replace(html, "{{NAV_EXTRAS}}", opts.NavExtras, 1)
	html = strings.Replace(html, "{{BEFORE_CONTAINER}}", opts.BeforeContainer, 1)
	html = strings.Replace(html, "{{CONTENT}}", opts.Content, 1)
	html = strings.Replace(html, "{{FOOTER_CONTENT}}", opts.FooterContent, 1)
	html = strings.Replace(html, "{{SCRIPTS}}", opts.Scripts, 1)

	// Logo href: "/" for selfhosted, "about.html" for static
	logoHref := "about.html"
	if opts.Selfhosted {
		logoHref = "/"
	}
	html = strings.Replace(html, "{{LOGO_HREF}}", logoHref, 1)

	// Replace version, build date, and GitHub URLs
	html = strings.Replace(html, "{{VERSION}}", pkgVersion, -1)
	html = strings.Replace(html, "{{BUILD_DATE}}", pkgBuildDate, -1)
	html = strings.Replace(html, "{{GITHUB_REPO}}", core.GitHubRepo, -1)
	html = strings.Replace(html, "{{GITHUB_PAGES}}", core.GitHubPages, -1)
	html = strings.Replace(html, "{{GITHUB_URL}}", githubURL(), -1)

	return html
}

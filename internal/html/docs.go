package html

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/translations"
)

// DocsLanguages returns the language codes that have a translated docs guide
// (e.g. ["es"]). English is excluded since it's the default.
func DocsLanguages() []string {
	entries, err := docsContentFS.ReadDir("docs-content")
	if err != nil {
		return nil
	}
	var langs []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		lang := strings.TrimSuffix(e.Name(), filepath.Ext(e.Name()))
		if lang != "en" {
			langs = append(langs, lang)
		}
	}
	return langs
}

// DocsLanguagesJS returns a JS array literal of language codes that have
// a translated docs guide (e.g. ['es']). English is excluded since it's
// the default and uses docs.html without a language suffix.
func DocsLanguagesJS() string {
	langs := DocsLanguages()
	quoted := make([]string, len(langs))
	for i, l := range langs {
		quoted[i] = "'" + l + "'"
	}
	return "[" + strings.Join(quoted, ",") + "]"
}

// renderDocsLangPicker generates the HTML for the language picker shown
// in the docs footer. The current language is shown as plain text; others
// are links to their respective docs file. Only languages that have a
// translated guide are included.
func renderDocsLangPicker(currentLang string) string {
	allLangs := append([]string{"en"}, DocsLanguages()...)
	if len(allLangs) < 2 {
		return ""
	}

	// Build a lookup from translations.LangNames
	nameOf := make(map[string]string)
	for _, entry := range translations.LangNames {
		nameOf[entry[0]] = entry[1]
	}

	var b strings.Builder
	b.WriteString(`      <div class="lang-picker">`)
	for _, lang := range allLangs {
		name := nameOf[lang]
		if name == "" {
			name = strings.ToUpper(lang)
		}
		if lang == currentLang {
			b.WriteString(fmt.Sprintf(`<span>%s</span>`, name))
		} else {
			href := "docs.html"
			if lang != "en" {
				href = "docs." + lang + ".html"
			}
			b.WriteString(fmt.Sprintf(`<a href="%s">%s</a>`, href, name))
		}
	}
	b.WriteString(`</div>`)
	return b.String()
}

// GenerateDocsHTML creates the documentation page HTML from Markdown content.
// version is the rememory version string.
// githubURL is the URL to download CLI binaries.
// lang is the language code (e.g. "en", "es"). Falls back to "en" if not found.
func GenerateDocsHTML(version, githubURL, lang string) string {
	if lang == "" {
		lang = "en"
	}

	// Load Markdown content for the requested language (fall back to English)
	mdContent, err := docsContentFS.ReadFile("docs-content/" + lang + ".md")
	if err != nil {
		mdContent, err = docsContentFS.ReadFile("docs-content/en.md")
		if err != nil {
			return fmt.Sprintf("<!-- error loading docs content: %v -->", err)
		}
		lang = "en"
	}

	// Parse frontmatter
	fm, body, err := parseFrontmatter(mdContent)
	if err != nil {
		return fmt.Sprintf("<!-- error parsing frontmatter: %v -->", err)
	}

	// Render Markdown to HTML + extract TOC
	content, tocEntries, err := renderDocsMarkdown(body)
	if err != nil {
		return fmt.Sprintf("<!-- error rendering markdown: %v -->", err)
	}

	// Generate TOC HTML
	tocHTML := renderTOC(tocEntries)

	// Inject into template
	result := docsHTMLTemplate

	// Embed styles
	result = strings.Replace(result, "{{STYLES}}", stylesCSS, 1)

	// Language
	result = strings.Replace(result, "{{LANG}}", lang, 1)

	// Frontmatter strings
	result = strings.Replace(result, "{{PAGE_TITLE}}", fm.Title, -1)
	result = strings.Replace(result, "{{PAGE_SUBTITLE}}", fm.Subtitle, -1)
	result = strings.Replace(result, "{{CLI_GUIDE_NOTE}}", fm.CLIGuideNote, 1)
	result = strings.Replace(result, "{{NAV_HOME}}", fm.NavHome, 1)
	result = strings.Replace(result, "{{NAV_HOME_LINK}}", fm.NavHomeLink, 1)
	result = strings.Replace(result, "{{NAV_CREATE}}", fm.NavCreate, 1)
	result = strings.Replace(result, "{{NAV_RECOVER}}", fm.NavRecover, 1)
	result = strings.Replace(result, "{{TOC_TITLE}}", fm.TOCTitle, 1)
	result = strings.Replace(result, "{{FOOTER_SOURCE}}", fm.FooterSource, 1)
	result = strings.Replace(result, "{{FOOTER_DOWNLOAD}}", fm.FooterDL, 1)
	result = strings.Replace(result, "{{FOOTER_HOME}}", fm.FooterHome, 1)

	// Content
	result = strings.Replace(result, "{{TOC}}", tocHTML, 1)
	result = strings.Replace(result, "{{DOCS_CONTENT}}", content, 1)

	// Language picker
	result = strings.Replace(result, "{{LANG_PICKER}}", renderDocsLangPicker(lang), 1)

	// Replace version and GitHub URLs
	result = strings.Replace(result, "{{VERSION}}", version, -1)
	result = strings.Replace(result, "{{GITHUB_REPO}}", core.GitHubRepo, -1)
	result = strings.Replace(result, "{{GITHUB_PAGES}}", core.GitHubPages, -1)
	result = strings.Replace(result, "{{GITHUB_URL}}", githubURL, -1)

	return result
}

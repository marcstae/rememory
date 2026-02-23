package html

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
	"github.com/yuin/goldmark/text"
	"gopkg.in/yaml.v3"
)

// DocsFrontmatter holds the chrome/UI strings from the YAML frontmatter
// at the top of each Markdown docs content file.
type DocsFrontmatter struct {
	Title        string `yaml:"title"`
	Subtitle     string `yaml:"subtitle"`
	CLIGuideNote string `yaml:"cli_guide_note"`
	NavHome      string `yaml:"nav_home"`
	NavHomeLink  string `yaml:"nav_home_link"`
	NavCreate    string `yaml:"nav_create"`
	NavRecover   string `yaml:"nav_recover"`
	TOCTitle     string `yaml:"toc_title"`
	FooterSource string `yaml:"footer_source"`
	FooterDL     string `yaml:"footer_download"`
	FooterHome   string `yaml:"footer_home"`
}

// TOCEntry represents a single entry in the table of contents.
type TOCEntry struct {
	ID    string // The heading's anchor ID
	Text  string // The heading text
	Level int    // 2 for h2, 3 for h3
}

// parseFrontmatter splits YAML frontmatter from a Markdown document.
// Returns the parsed frontmatter, the remaining Markdown body, and any error.
func parseFrontmatter(content []byte) (DocsFrontmatter, []byte, error) {
	var fm DocsFrontmatter

	s := string(content)
	if !strings.HasPrefix(s, "---\n") {
		return fm, content, fmt.Errorf("missing frontmatter: document must start with ---")
	}

	end := strings.Index(s[4:], "\n---\n")
	if end == -1 {
		return fm, content, fmt.Errorf("unterminated frontmatter: missing closing ---")
	}

	fmBytes := []byte(s[4 : 4+end])
	body := []byte(s[4+end+5:]) // skip past the closing ---\n

	if err := yaml.Unmarshal(fmBytes, &fm); err != nil {
		return fm, content, fmt.Errorf("invalid frontmatter YAML: %w", err)
	}

	return fm, body, nil
}

// renderDocsMarkdown converts Markdown source to HTML content and extracts TOC entries.
// It uses goldmark with attribute support for heading IDs ({#id} syntax)
// and HTML block passthrough for custom components.
// The output HTML has h2-level groups wrapped in <section id="..." class="doc-section"> tags.
func renderDocsMarkdown(source []byte) (string, []TOCEntry, error) {
	md := goldmark.New(
		goldmark.WithParserOptions(
			parser.WithAttribute(),
		),
		goldmark.WithRendererOptions(
			html.WithUnsafe(),
		),
	)

	// Extract TOC entries by walking the AST
	reader := text.NewReader(source)
	doc := md.Parser().Parse(reader)
	var toc []TOCEntry
	ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		heading, ok := n.(*ast.Heading)
		if !ok || (heading.Level != 2 && heading.Level != 3) {
			return ast.WalkContinue, nil
		}
		// Get the ID from attributes
		id := ""
		for _, attr := range heading.Attributes() {
			if string(attr.Name) == "id" {
				id = string(attr.Value.([]byte))
				break
			}
		}
		if id == "" {
			return ast.WalkContinue, nil
		}
		// Extract heading text
		var textBuf bytes.Buffer
		for child := heading.FirstChild(); child != nil; child = child.NextSibling() {
			if t, ok := child.(*ast.Text); ok {
				textBuf.Write(t.Segment.Value(source))
			}
		}
		toc = append(toc, TOCEntry{
			ID:    id,
			Text:  textBuf.String(),
			Level: heading.Level,
		})
		return ast.WalkContinue, nil
	})

	// Render Markdown to HTML
	var buf bytes.Buffer
	if err := md.Renderer().Render(&buf, source, doc); err != nil {
		return "", nil, fmt.Errorf("markdown render: %w", err)
	}

	// Wrap h2 groups in <section> tags
	rendered := wrapSections(buf.String())

	return rendered, toc, nil
}

// wrapSections wraps groups of content starting with <h2> into <section> tags.
// Each <h2 id="xxx"> starts a new section: <section id="xxx" class="doc-section">
var h2Regex = regexp.MustCompile(`<h2([^>]*)>`)
var h2IDRegex = regexp.MustCompile(`id="([^"]+)"`)

// h2IDAttrRegex matches id="..." attributes inside an h2 tag for removal.
var h2IDAttrRegex = regexp.MustCompile(` id="[^"]*"`)

func wrapSections(html string) string {
	// Find all h2 positions
	matches := h2Regex.FindAllStringIndex(html, -1)
	if len(matches) == 0 {
		return html
	}

	var result strings.Builder
	// Content before first h2 (if any)
	if matches[0][0] > 0 {
		result.WriteString(html[:matches[0][0]])
	}

	for i, match := range matches {
		// Determine the section content (from this h2 to the next, or end)
		start := match[0]
		var end int
		if i+1 < len(matches) {
			end = matches[i+1][0]
		} else {
			end = len(html)
		}

		sectionContent := html[start:end]

		// Extract ID from the h2 tag
		h2Tag := html[match[0]:match[1]]
		idMatch := h2IDRegex.FindStringSubmatch(h2Tag)
		id := ""
		if len(idMatch) > 1 {
			id = idMatch[1]
		}

		// Remove the id attribute from the h2 tag to avoid duplicate IDs
		// (the id lives on the <section> wrapper instead)
		if id != "" {
			cleanH2 := h2IDAttrRegex.ReplaceAllString(h2Tag, "")
			sectionContent = cleanH2 + sectionContent[match[1]-match[0]:]
		}

		// Write the section wrapper
		if id != "" {
			result.WriteString("    <section id=\"")
			result.WriteString(id)
			result.WriteString("\" class=\"doc-section\">\n")
		} else {
			result.WriteString("    <section class=\"doc-section\">\n")
		}
		result.WriteString("      ")
		result.WriteString(strings.TrimRight(sectionContent, "\n"))
		result.WriteString("\n    </section>\n\n")
	}

	return result.String()
}

// renderTOC generates the sidebar TOC HTML from TOC entries.
// h2 entries become top-level <li>, h3 entries become <li class="indent">.
func renderTOC(entries []TOCEntry) string {
	var b strings.Builder
	for _, e := range entries {
		if e.Level == 3 {
			b.WriteString(`          <li class="indent"><a href="#`)
		} else {
			b.WriteString(`          <li><a href="#`)
		}
		b.WriteString(e.ID)
		b.WriteString(`">`)
		b.WriteString(e.Text)
		b.WriteString("</a></li>\n")
	}
	return strings.TrimRight(b.String(), "\n")
}

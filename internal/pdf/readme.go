package pdf

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"golang.org/x/text/unicode/norm"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/project"
	"github.com/eljojo/rememory/internal/translations"
)

// ReadmeData contains all data needed to generate README.pdf
type ReadmeData struct {
	ProjectName      string
	Holder           string
	Share            *core.Share
	OtherFriends     []project.Friend
	Threshold        int
	Total            int
	Version          string
	GitHubReleaseURL string
	ManifestChecksum string
	RecoverChecksum  string
	Created          time.Time
	Anonymous        bool
	Language         string // Bundle language (e.g. "en", "es"); defaults to "en"
	ManifestEmbedded bool   // true when manifest is embedded in recover.html
	TlockEnabled     bool   // true when manifest uses time-lock encryption
}

// Font sizes
const (
	titleSize   = 22.0
	headingSize = 12.0
	bodySize    = 10.0
	monoSize    = 8.0
	smallMono   = 7.0
)

// bundleColors give each friend's PDF a distinct visual identity.
// More saturated than the web palette to stand out clearly on paper.
// All dark enough for white text (perceived brightness < 130).
var bundleColors = [][3]int{
	{55, 90, 155},  // cobalt blue
	{40, 105, 60},  // forest green
	{155, 95, 35},  // burnt amber
	{120, 60, 135}, // plum
	{30, 115, 110}, // deep teal
	{160, 80, 35},  // terracotta
	{80, 90, 160},  // slate blue
	{160, 60, 80},  // rose
}

// GenerateReadme creates the README.pdf content.
// The PDF is structured across five pages:
//   - Page 1: Identity & overview (visual role paths, threshold rule, contacts)
//   - Page 2: How to recover — browser (step by step)
//   - Page 3: Your piece (recovery words in native language + English)
//   - Page 4: Text format (machine-readable PEM block, easy to copy-paste)
//   - Page 5: Fallback — command line tool + metadata
func GenerateReadme(data ReadmeData) ([]byte, error) {
	lang := data.Language
	if lang == "" {
		lang = "en"
	}
	t := func(key string, args ...any) string {
		return translations.T("readme", lang, key, args...)
	}

	p := fpdf.New("P", "mm", "A4", "")
	// Top margin 30 to leave room for the 10mm header strip + breathing space.
	p.SetMargins(20, 30, 20)
	p.SetAutoPageBreak(true, 22)

	registerUTF8Fonts(p)

	colorIdx := 0
	if data.Share != nil && data.Share.Index > 0 {
		colorIdx = (data.Share.Index - 1) % len(bundleColors)
	}
	bc := bundleColors[colorIdx]

	pageWidth, _ := p.GetPageSize()
	leftMargin, _, rightMargin, _ := p.GetMargins()
	contentWidth := pageWidth - leftMargin - rightMargin

	// ── Header: color strip + holder identity on every page ──────────────────
	p.SetHeaderFunc(func() {
		p.SetFillColor(bc[0], bc[1], bc[2])
		p.Rect(0, 0, pageWidth, 10, "F")
		p.SetFont(fontSans, "B", 8)
		p.SetTextColor(255, 255, 255)
		p.SetXY(leftMargin, 2)
		p.CellFormat(contentWidth, 6, data.Holder+" — "+t("title"), "", 0, "R", false, 0, "")
		p.SetTextColor(46, 42, 38) // Reset cursor to top-left of content area so the first content line
		// draws at the correct position regardless of where the header left off.
		_, topMargin, _, _ := p.GetMargins()
		p.SetXY(leftMargin, topMargin)
	})

	// ── Footer: page number ───────────────────────────────────────────────────
	p.SetFooterFunc(func() {
		p.SetY(-12)
		p.SetFont(fontSans, "", 7)
		p.SetTextColor(180, 180, 180)
		p.CellFormat(0, 8, fmt.Sprintf("%d", p.PageNo()), "", 0, "C", false, 0, "")
		p.SetTextColor(46, 42, 38)
	})

	shareText := data.Share.Encode()

	// ══════════════════════════════════════════════════════════════════════════
	// PAGE 1: Identity & Overview
	// ══════════════════════════════════════════════════════════════════════════
	p.AddPage()

	// Title
	p.Ln(5)
	p.SetFont(fontSans, "B", titleSize)
	p.SetTextColor(bc[0], bc[1], bc[2])
	p.CellFormat(0, 12, t("title"), "", 1, "C", false, 0, "")
	p.SetTextColor(46, 42, 38)
	p.SetFont(fontSans, "", 14)
	p.CellFormat(0, 8, t("for", data.Holder), "", 1, "C", false, 0, "")

	// Decorative rule in bundle color
	p.SetDrawColor(bc[0], bc[1], bc[2])
	p.SetLineWidth(0.8)
	p.Ln(3)
	p.Line(leftMargin+35, p.GetY(), pageWidth-rightMargin-35, p.GetY())
	p.SetDrawColor(200, 200, 200)
	p.SetLineWidth(0.2)
	p.Ln(8)

	// ── Threshold box — the most important thing on the page ─────────────────
	addThresholdBox(p, t("recovery_rule"), t("recovery_rule_count", data.Threshold, data.Total), leftMargin, contentWidth, bc)
	p.Ln(8)

	// ── Visual role paths — "Why are you reading this?" ──────────────────────
	// Three tinted boxes guide the reader to the right page immediately.
	addPathBox(p, t("path1_title"), t("path1_body", data.ProjectName), leftMargin, contentWidth, bc)
	p.Ln(3)
	addPathBox(p, t("path2_title"), t("path2_body"), leftMargin, contentWidth, bc)
	p.Ln(3)
	addPathBox(p, t("path3_title"), t("path3_body"), leftMargin, contentWidth, bc)
	p.Ln(6)

	// ── Contact list ──────────────────────────────────────────────────────────
	if !data.Anonymous {
		addColorSection(p, t("other_holders"), bc)
		for _, friend := range data.OtherFriends {
			p.SetFont(fontSans, "B", bodySize)
			if friend.Contact != "" {
				nameStr := "   " + friend.Name
				nameW := p.GetStringWidth(nameStr)
				p.CellFormat(nameW, 7, nameStr, "", 0, "L", false, 0, "")
				p.SetFont(fontSans, "", bodySize)
				p.CellFormat(0, 7, "  \u2014  "+friend.Contact, "", 1, "L", false, 0, "")
			} else {
				p.CellFormat(0, 7, "   "+friend.Name, "", 1, "L", false, 0, "")
			}
		}
		p.Ln(6)
	}

	// ══════════════════════════════════════════════════════════════════════════
	// PAGE 2: Browser Recovery — step by step
	// ══════════════════════════════════════════════════════════════════════════
	p.AddPage()
	addColorSection(p, t("recover_browser"), bc)
	p.Ln(3)

	const badgeIndent = 11.0 // mm offset for sub-content (badge 9mm + 2mm gap)
	stepNum := 1
	addStep := func(text string) {
		// Strip leading "N. " from translation strings — the badge already shows the number.
		if len(text) >= 3 && text[0] >= '1' && text[0] <= '9' && text[1] == '.' && text[2] == ' ' {
			text = text[3:]
		}
		addStepRow(p, stepNum, text, leftMargin, contentWidth, bc)
		stepNum++
	}
	addSub := func(text string) {
		// Strip leading "- " prefix that translation strings include for plain-text
		// contexts; the PDF renders its own bullet symbol.
		text = strings.TrimPrefix(text, "- ")
		p.SetFont(fontSans, "", bodySize)
		p.SetX(leftMargin + badgeIndent)
		p.MultiCell(contentWidth-badgeIndent, 5, "\u2022  "+text, "", "L", false)
	}

	// Step 1: open recover.html
	addStep(t("recover_step1"))
	addSub(t("recover_step1_browsers"))
	addSub(t("recover_no_html"))
	p.Ln(3)

	// Step 2: load manifest (or note it's embedded)
	if data.ManifestEmbedded {
		addStep(t("recover_step2_embedded"))
		addSub(t("recover_step2_embedded_hint"))
	} else {
		addStep(t("recover_step2_manifest"))
	}
	p.Ln(3)

	// Steps 3–final
	if data.Anonymous {
		addStep(t("recover_anon_step3"))
		addSub(t("recover_anon_step3_how1"))
		addSub(t("recover_anon_step3_how2"))
		addSub(t("recover_anon_step3_how3"))
		p.Ln(3)
		addStep(t("recover_anon_step4_auto", data.Threshold))
		p.Ln(3)
		addStep(t("recover_anon_step5"))
	} else {
		addStep(t("recover_step3_contact"))
		addSub(t("recover_step3_how1"))
		addSub(t("recover_step3_how2"))
		addSub(t("recover_step3_how3"))
		p.Ln(3)
		addStep(t("recover_step4_checkmarks"))
		addSub(t("recover_step5_auto", data.Threshold))
		p.Ln(3)
		addStep(t("recover_step6"))
	}
	p.Ln(5)
	p.SetFont(fontSans, "I", bodySize)
	if data.TlockEnabled {
		p.MultiCell(0, 5, t("recover_offline_tlock"), "", "L", false)
	} else {
		p.MultiCell(0, 5, t("recover_offline"), "", "L", false)
	}

	// ══════════════════════════════════════════════════════════════════════════
	// PAGE 3: Your Piece — recovery words
	// ══════════════════════════════════════════════════════════════════════════
	p.AddPage()
	addColorSection(p, t("your_share"), bc)
	p.Ln(2)

	nativeWords, _ := data.Share.WordsForLang(core.Lang(lang))
	if len(nativeWords) > 0 {
		if lang != "en" {
			langName := t("lang_" + lang)
			renderWordGridPDF(p, nativeWords, t("recovery_words_title_lang", len(nativeWords), langName), leftMargin, contentWidth, bc)
			p.SetFont(fontSans, "I", bodySize)
			p.MultiCell(0, 5, t("recovery_words_hint"), "", "L", false)
			p.Ln(5)

			englishWords, _ := data.Share.Words()
			renderWordGridPDF(p, englishWords, t("recovery_words_title_english", len(englishWords)), leftMargin, contentWidth, bc)
			p.SetFont(fontSans, "I", bodySize)
			p.MultiCell(0, 5, t("recovery_words_dual_hint"), "", "L", false)
			p.Ln(5)
		} else {
			renderWordGridPDF(p, nativeWords, t("recovery_words_title", len(nativeWords)), leftMargin, contentWidth, bc)
			p.SetFont(fontSans, "I", bodySize)
			p.MultiCell(0, 5, t("recovery_words_hint"), "", "L", false)
			p.Ln(5)
		}
	}

	// ══════════════════════════════════════════════════════════════════════════
	// PAGE 4: Text Format — machine-readable PEM block
	// ══════════════════════════════════════════════════════════════════════════
	// PEM block — render each line on a single row so copy-paste works cleanly.
	// Auto-shrink font if a line (e.g. Checksum) is wider than the content area.
	// Empty lines use a space cell (not Ln) so copy-paste preserves them.
	p.AddPage()
	addColorSection(p, t("machine_readable"), bc)
	p.SetFont(fontSans, "I", bodySize-1)
	p.SetTextColor(120, 115, 110)
	p.MultiCell(0, 4.5, t("machine_readable_hint"), "", "L", false)
	p.SetTextColor(46, 42, 38)
	p.Ln(4)
	p.SetFillColor(248, 248, 248)
	pemLines := strings.Split(strings.TrimRight(shareText, "\n"), "\n")
	for _, line := range pemLines {
		if line != "" {
			fs := smallMono
			p.SetFont(fontMono, "", fs)
			for p.GetStringWidth(line) > contentWidth-2 && fs > 4 {
				fs -= 0.5
				p.SetFont(fontMono, "", fs)
			}
			p.CellFormat(contentWidth, 3.5, line, "", 1, "L", true, 0, "")
		} else {
			// Render a space cell so the empty line appears in copy-paste output
			p.SetFont(fontMono, "", smallMono)
			p.CellFormat(contentWidth, 3.5, " ", "", 1, "L", true, 0, "")
		}
	}

	// ══════════════════════════════════════════════════════════════════════════
	// PAGE 5: CLI Fallback + Metadata
	// ══════════════════════════════════════════════════════════════════════════
	p.AddPage()
	addColorSection(p, t("recover_cli"), bc)
	p.Ln(3)
	addBody(p, t("recover_cli_hint"))
	p.Ln(6)

	// Helper section — clear structure for the tech-savvy person
	addColorSection(p, t("recover_cli_helper_title"), bc)
	p.Ln(1)
	addBody(p, t("recover_cli_download"))
	p.Ln(2)
	p.SetFont(fontMono, "", monoSize)
	p.SetFillColor(248, 248, 248)
	p.MultiCell(0, 5, "  "+data.GitHubReleaseURL, "", "L", true)
	p.Ln(4)
	addBody(p, t("recover_cli_run"))
	p.Ln(2)
	// Prominent command box with bundle-colored border
	p.SetFont(fontMono, "B", monoSize+1)
	p.SetFillColor(248, 248, 248)
	p.SetDrawColor(bc[0], bc[1], bc[2])
	p.SetLineWidth(1.0)
	p.MultiCell(0, 7, "  "+t("recover_cli_usage"), "1", "L", true)
	p.SetLineWidth(0.2)
	p.SetDrawColor(200, 200, 200)
	p.Ln(4)
	p.SetFont(fontSans, "I", bodySize-1)
	p.SetTextColor(100, 100, 100)
	p.MultiCell(0, 4.5, t("recover_cli_no_install"), "", "L", false)
	p.SetTextColor(46, 42, 38)
	p.Ln(10)

	// Metadata block
	p.SetFont(fontSans, "B", smallMono)
	p.CellFormat(0, 5, "METADATA", "", 1, "L", false, 0, "")
	p.SetFont(fontMono, "", smallMono)
	p.SetFillColor(248, 248, 248)
	addMeta(p, "rememory-version", data.Version)
	addMeta(p, "created", data.Created.Format(time.RFC3339))
	addMeta(p, "project", data.ProjectName)
	addMeta(p, "threshold", fmt.Sprintf("%d", data.Threshold))
	addMeta(p, "total", fmt.Sprintf("%d", data.Total))
	addMeta(p, "github-release", data.GitHubReleaseURL)
	addMeta(p, "checksum-manifest", data.ManifestChecksum)
	addMeta(p, "checksum-recover-html", data.RecoverChecksum)

	// Write to buffer
	var buf bytes.Buffer
	if err := p.Output(&buf); err != nil {
		return nil, fmt.Errorf("writing PDF: %w", err)
	}

	// Append the machine-readable share so recover.html can accept this PDF as input.
	buf.WriteString(shareText)

	return buf.Bytes(), nil
}

// renderWordGridPDF renders a two-column word grid with page-break detection.
func renderWordGridPDF(p *fpdf.Fpdf, words []string, title string, leftMargin, contentWidth float64, bc [3]int) {
	half := (len(words) + 1) / 2
	rowHeight := 5.5
	gridHeight := 10 + float64(half)*rowHeight + 2
	_, pageHeight := p.GetPageSize()
	_, _, _, bottomMargin := p.GetMargins()
	usableBottom := pageHeight - bottomMargin

	if p.GetY()+gridHeight > usableBottom {
		p.AddPage()
	}

	addColorSection(p, title, bc)
	p.SetFont(fontMono, "", bodySize)

	colWidth := contentWidth / 2
	startY := p.GetY()

	for i := 0; i < half; i++ {
		y := startY + float64(i)*rowHeight

		// NFC-normalize words so accented characters render as single glyphs
		// (BIP39 word lists may store them in NFD form: ra + combining accent + pido)
		p.SetXY(leftMargin, y)
		p.CellFormat(colWidth, 5, fmt.Sprintf("%2d. %s", i+1, norm.NFC.String(words[i])), "", 0, "L", false, 0, "")

		if i+half < len(words) {
			p.SetXY(leftMargin+colWidth, y)
			p.CellFormat(colWidth, 5, fmt.Sprintf("%2d. %s", i+half+1, norm.NFC.String(words[i+half])), "", 0, "L", false, 0, "")
		}
	}

	p.SetY(startY + float64(half)*rowHeight + 2)
}

// tintColor returns a light tinted version of bc for use as a background fill.
// Blends 80% toward white — light enough to be non-distracting, visible enough to show structure.
func tintColor(bc [3]int) (int, int, int) {
	blend := func(c int) int { return c + (255-c)*4/5 }
	return blend(bc[0]), blend(bc[1]), blend(bc[2])
}

// addColorSection renders a section header bar in the bundle's identity color with white text.
// Uses MultiCell so long titles (e.g. German) wrap to a second line instead of clipping.
func addColorSection(p *fpdf.Fpdf, title string, bc [3]int) {
	pw, _ := p.GetPageSize()
	lm, _, rm, _ := p.GetMargins()
	cw := pw - lm - rm
	// Ensure we start at the left margin — the header func may leave cursor elsewhere.
	p.SetX(lm)
	p.SetFont(fontSans, "B", headingSize)
	p.SetFillColor(bc[0], bc[1], bc[2])
	p.SetTextColor(255, 255, 255)
	p.MultiCell(cw, 9, "  "+title, "", "L", true)
	p.SetTextColor(46, 42, 38)
	p.Ln(2)
}

// addThresholdBox renders the prominent "X of Y required" rule box.
func addThresholdBox(p *fpdf.Fpdf, label, count string, leftMargin, contentWidth float64, bc [3]int) {
	y := p.GetY()
	boxH := 30.0

	// Tinted fill with saturated border
	p.SetFillColor(tintColor(bc))
	p.SetDrawColor(bc[0], bc[1], bc[2])
	p.SetLineWidth(1.5)
	p.Rect(leftMargin, y, contentWidth, boxH, "FD")
	p.SetLineWidth(0.2)
	p.SetDrawColor(200, 200, 200)

	// Label (small, grey)
	p.SetFont(fontSans, "", 9)
	p.SetTextColor(100, 100, 100)
	p.SetXY(leftMargin, y+4)
	p.CellFormat(contentWidth, 5, label, "", 1, "C", false, 0, "")

	// Count (large, in bundle color)
	p.SetFont(fontSans, "B", 26)
	p.SetTextColor(bc[0], bc[1], bc[2])
	p.SetXY(leftMargin, y+10)
	p.CellFormat(contentWidth, 16, count, "", 1, "C", false, 0, "")

	p.SetTextColor(46, 42, 38)
	p.SetY(y + boxH)
}

// addStepRow renders a numbered step with a colored badge on the left.
// Uses MultiCell for the text so long translations (e.g. German) wrap
// instead of overflowing the right margin.
func addStepRow(p *fpdf.Fpdf, num int, text string, leftMargin, contentWidth float64, bc [3]int) {
	badgeW := 9.0
	lineH := 5.5
	minH := 8.0

	startY := p.GetY()

	// Render text with MultiCell — wraps automatically, tinted fill
	tr, tg, tb := tintColor(bc)
	p.SetFillColor(tr, tg, tb)
	p.SetTextColor(46, 42, 38)
	p.SetFont(fontSans, "", bodySize)
	p.SetXY(leftMargin+badgeW, startY)
	p.MultiCell(contentWidth-badgeW, lineH, "  "+text, "", "L", true)
	endY := p.GetY()
	rowH := endY - startY

	// Enforce minimum height for single-line steps
	if rowH < minH {
		p.SetFillColor(tr, tg, tb)
		p.Rect(leftMargin+badgeW, endY, contentWidth-badgeW, minH-rowH, "F")
		rowH = minH
		endY = startY + rowH
	}

	// Badge: colored rectangle spanning the full row height
	p.SetFillColor(bc[0], bc[1], bc[2])
	p.Rect(leftMargin, startY, badgeW, rowH, "F")

	// Number centered vertically in the badge
	p.SetTextColor(255, 255, 255)
	p.SetFont(fontSans, "B", 11)
	p.SetXY(leftMargin, startY+(rowH-6)/2)
	p.CellFormat(badgeW, 6, fmt.Sprintf("%d", num), "", 0, "C", false, 0, "")

	p.SetTextColor(46, 42, 38)
	p.SetY(endY)
	p.Ln(1)
}

func addBody(pdf *fpdf.Fpdf, text string) {
	pdf.SetFont(fontSans, "", bodySize)
	pdf.MultiCell(0, 5, text, "", "L", false)
}

// addPathBox renders a role-path box with a bold title and body text on a tinted background.
// Used on page 1 to visually guide readers to the right page.
func addPathBox(p *fpdf.Fpdf, title, body string, leftMargin, contentWidth float64, bc [3]int) {
	r, g, b := tintColor(bc)
	p.SetFillColor(r, g, b)

	// Title in bundle color
	p.SetX(leftMargin)
	p.SetFont(fontSans, "B", bodySize+1)
	p.SetTextColor(bc[0], bc[1], bc[2])
	p.CellFormat(contentWidth, 7, "  "+title, "", 1, "L", true, 0, "")

	// Body text
	p.SetX(leftMargin)
	p.SetFont(fontSans, "", bodySize)
	p.SetTextColor(46, 42, 38)
	p.MultiCell(contentWidth, 5, "  "+body, "", "L", true)
}

func addMeta(pdf *fpdf.Fpdf, key, value string) {
	pdf.CellFormat(0, 4, fmt.Sprintf("%s: %s", key, value), "", 1, "L", true, 0, "")
}

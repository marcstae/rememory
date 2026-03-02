package bundle

import (
	"fmt"
	"strings"
	"time"

	"golang.org/x/text/unicode/norm"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/project"
	"github.com/eljojo/rememory/internal/translations"
)

// ReadmeData contains all data needed to generate README.txt
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

// writeWordGrid writes a two-column word grid to the string builder.
// Words are NFC-normalized so accented characters are precomposed
// (BIP39 word lists may store them in NFD form).
func writeWordGrid(sb *strings.Builder, words []string) {
	half := (len(words) + 1) / 2
	for i := 0; i < half; i++ {
		left := fmt.Sprintf("%2d. %-18s", i+1, norm.NFC.String(words[i]))
		if i+half < len(words) {
			right := fmt.Sprintf("%2d. %s", i+half+1, norm.NFC.String(words[i+half]))
			sb.WriteString(fmt.Sprintf("%s%s\n", left, right))
		} else {
			sb.WriteString(left + "\n")
		}
	}
}

// GenerateReadme creates the README.txt content with all embedded information.
func GenerateReadme(data ReadmeData) string {
	lang := data.Language
	if lang == "" {
		lang = "en"
	}
	t := func(key string, args ...any) string {
		return translations.T("readme", lang, key, args...)
	}

	var sb strings.Builder

	// Header
	sb.WriteString("================================================================================\n")
	sb.WriteString(fmt.Sprintf("                          %s\n", t("title")))
	sb.WriteString(fmt.Sprintf("                              %s\n", t("for", data.Holder)))
	sb.WriteString("================================================================================\n\n")

	// Recovery rule (threshold box equivalent)
	sb.WriteString(fmt.Sprintf("   %s: %s\n\n", t("recovery_rule"), t("recovery_rule_count", data.Threshold, data.Total)))

	// Visual role paths — "Why are you reading this?"
	sb.WriteString("--------------------------------------------------------------------------------\n")
	sb.WriteString(fmt.Sprintf("%s\n", t("path1_title")))
	sb.WriteString(fmt.Sprintf("   %s\n\n", t("path1_body", data.ProjectName)))
	sb.WriteString(fmt.Sprintf("%s\n", t("path2_title")))
	sb.WriteString(fmt.Sprintf("   %s\n\n", t("path2_body")))
	sb.WriteString(fmt.Sprintf("%s\n", t("path3_title")))
	sb.WriteString(fmt.Sprintf("   %s\n", t("path3_body")))
	sb.WriteString("--------------------------------------------------------------------------------\n\n")

	// Other share holders (skip for anonymous mode)
	if !data.Anonymous {
		sb.WriteString("--------------------------------------------------------------------------------\n")
		sb.WriteString(fmt.Sprintf("%s\n", t("other_holders")))
		sb.WriteString("--------------------------------------------------------------------------------\n")
		for _, friend := range data.OtherFriends {
			sb.WriteString(fmt.Sprintf("%s\n", friend.Name))
			if friend.Contact != "" {
				sb.WriteString(fmt.Sprintf("  %s\n", t("contact_label", friend.Contact)))
			}
			sb.WriteString("\n")
		}
	}

	// ── PAGE 2 equivalent: How to recover ──
	sb.WriteString("--------------------------------------------------------------------------------\n")
	sb.WriteString(fmt.Sprintf("%s\n", t("recover_browser")))
	sb.WriteString("--------------------------------------------------------------------------------\n")
	sb.WriteString(fmt.Sprintf("1. %s\n", t("recover_step1")))
	sb.WriteString(fmt.Sprintf("   %s\n", t("recover_step1_browsers")))
	sb.WriteString(fmt.Sprintf("   %s\n", t("recover_share_loaded")))
	sb.WriteString(fmt.Sprintf("   %s\n\n", t("recover_no_html")))
	if data.ManifestEmbedded {
		sb.WriteString(fmt.Sprintf("2. %s\n", t("recover_step2_embedded")))
		sb.WriteString(fmt.Sprintf("   %s\n\n", t("recover_step2_embedded_hint")))
	} else {
		sb.WriteString(fmt.Sprintf("2. %s\n\n", t("recover_step2_manifest")))
	}
	if data.Anonymous {
		sb.WriteString(fmt.Sprintf("3. %s\n", t("recover_anon_step3")))
		sb.WriteString(fmt.Sprintf("   - %s\n", t("recover_anon_step3_how1")))
		sb.WriteString(fmt.Sprintf("   - %s\n", t("recover_anon_step3_how2")))
		sb.WriteString(fmt.Sprintf("   - %s\n\n", t("recover_anon_step3_how3")))
		sb.WriteString(fmt.Sprintf("4. %s\n\n", t("recover_anon_step4_auto", data.Threshold)))
		sb.WriteString(fmt.Sprintf("5. %s\n\n", t("recover_anon_step5")))
	} else {
		sb.WriteString(fmt.Sprintf("3. %s\n", t("recover_step3_contact")))
		sb.WriteString(fmt.Sprintf("   - %s\n", t("recover_step3_how1")))
		sb.WriteString(fmt.Sprintf("   - %s\n", t("recover_step3_how2")))
		sb.WriteString(fmt.Sprintf("   - %s\n\n", t("recover_step3_how3")))
		sb.WriteString(fmt.Sprintf("   %s\n", t("recover_step4_checkmarks")))
		sb.WriteString(fmt.Sprintf("   %s\n\n", t("recover_step5_auto", data.Threshold)))
		sb.WriteString(fmt.Sprintf("4. %s\n\n", t("recover_step6")))
	}
	if data.TlockEnabled {
		sb.WriteString(fmt.Sprintf("%s\n\n", t("recover_offline_tlock")))
	} else {
		sb.WriteString(fmt.Sprintf("%s\n\n", t("recover_offline")))
	}

	// ── PAGE 3 equivalent: Your piece ──
	sb.WriteString("--------------------------------------------------------------------------------\n")
	sb.WriteString(fmt.Sprintf("%s\n", t("your_share")))
	sb.WriteString("--------------------------------------------------------------------------------\n")

	// Word list (primary human-readable format)
	nativeWords, _ := data.Share.WordsForLang(core.Lang(lang))
	if len(nativeWords) > 0 {
		if lang != "en" {
			// Non-English: show native language grid first, then English
			langName := t("lang_" + lang)
			sb.WriteString(fmt.Sprintf("%s\n\n", t("recovery_words_title_lang", len(nativeWords), langName)))
			writeWordGrid(&sb, nativeWords)
			sb.WriteString(fmt.Sprintf("\n%s\n\n", t("recovery_words_hint")))

			// English fallback grid
			englishWords, _ := data.Share.Words()
			sb.WriteString(fmt.Sprintf("%s\n\n", t("recovery_words_title_english", len(englishWords))))
			writeWordGrid(&sb, englishWords)
			sb.WriteString(fmt.Sprintf("\n%s\n\n", t("recovery_words_dual_hint")))
		} else {
			// English only: single grid
			sb.WriteString(fmt.Sprintf("%s\n\n", t("recovery_words_title", len(nativeWords))))
			writeWordGrid(&sb, nativeWords)
			sb.WriteString(fmt.Sprintf("\n%s\n\n", t("recovery_words_hint")))
		}
	}

	// Fallback method - CLI
	sb.WriteString("--------------------------------------------------------------------------------\n")
	sb.WriteString(fmt.Sprintf("%s\n", t("recover_cli")))
	sb.WriteString("--------------------------------------------------------------------------------\n")
	sb.WriteString(fmt.Sprintf("%s\n", t("recover_cli_for_helper")))
	sb.WriteString(fmt.Sprintf("%s\n\n", data.GitHubReleaseURL))
	sb.WriteString(fmt.Sprintf("%s\n\n", t("recover_cli_usage")))

	// PEM block (machine-readable format)
	sb.WriteString(fmt.Sprintf("%s\n", t("machine_readable")))
	sb.WriteString(data.Share.Encode())
	sb.WriteString("\n")

	// Metadata footer (use fixed English marker for machine parsing)
	sb.WriteString("================================================================================\n")
	sb.WriteString("METADATA FOOTER (machine-parseable)\n")
	sb.WriteString("================================================================================\n")
	sb.WriteString(fmt.Sprintf("rememory-version: %s\n", data.Version))
	sb.WriteString(fmt.Sprintf("created: %s\n", data.Created.Format(time.RFC3339)))
	sb.WriteString(fmt.Sprintf("project: %s\n", data.ProjectName))
	sb.WriteString(fmt.Sprintf("threshold: %d\n", data.Threshold))
	sb.WriteString(fmt.Sprintf("total: %d\n", data.Total))
	sb.WriteString(fmt.Sprintf("github-release: %s\n", data.GitHubReleaseURL))
	sb.WriteString(fmt.Sprintf("checksum-manifest: %s\n", data.ManifestChecksum))
	sb.WriteString(fmt.Sprintf("checksum-recover-html: %s\n", data.RecoverChecksum))
	sb.WriteString("================================================================================\n")

	return sb.String()
}

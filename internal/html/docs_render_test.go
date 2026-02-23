package html

import (
	"strings"
	"testing"
)

func TestParseFrontmatter(t *testing.T) {
	t.Run("valid frontmatter", func(t *testing.T) {
		input := []byte("---\ntitle: \"Test Title\"\nsubtitle: \"A subtitle\"\n---\n# Content here\n")
		fm, body, err := parseFrontmatter(input)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fm.Title != "Test Title" {
			t.Errorf("title = %q, want %q", fm.Title, "Test Title")
		}
		if fm.Subtitle != "A subtitle" {
			t.Errorf("subtitle = %q, want %q", fm.Subtitle, "A subtitle")
		}
		if !strings.Contains(string(body), "# Content here") {
			t.Errorf("body should contain content, got: %s", body)
		}
	})

	t.Run("all frontmatter fields", func(t *testing.T) {
		input := []byte("---\ntitle: \"T\"\nsubtitle: \"S\"\ncli_guide_note: \"CLI\"\nnav_home: \"Home\"\nnav_home_link: \"HL\"\nnav_create: \"Create\"\nnav_recover: \"Recover\"\ntoc_title: \"TOC\"\nfooter_source: \"Source\"\nfooter_download: \"DL\"\nfooter_home: \"FH\"\n---\nBody\n")
		fm, _, err := parseFrontmatter(input)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if fm.NavHome != "Home" {
			t.Errorf("nav_home = %q", fm.NavHome)
		}
		if fm.TOCTitle != "TOC" {
			t.Errorf("toc_title = %q", fm.TOCTitle)
		}
		if fm.FooterSource != "Source" {
			t.Errorf("footer_source = %q", fm.FooterSource)
		}
	})

	t.Run("missing frontmatter", func(t *testing.T) {
		input := []byte("# Just content\nNo frontmatter here.\n")
		_, _, err := parseFrontmatter(input)
		if err == nil {
			t.Error("expected error for missing frontmatter")
		}
	})

	t.Run("unterminated frontmatter", func(t *testing.T) {
		input := []byte("---\ntitle: \"Test\"\nNo closing marker\n")
		_, _, err := parseFrontmatter(input)
		if err == nil {
			t.Error("expected error for unterminated frontmatter")
		}
	})
}

func TestRenderDocsMarkdown(t *testing.T) {
	t.Run("basic prose", func(t *testing.T) {
		source := []byte("## Overview {#overview}\n\nSome text here.\n\n- Item one\n- Item two\n")
		html, toc, err := renderDocsMarkdown(source)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(html, "<p>Some text here.</p>") {
			t.Errorf("should contain paragraph, got: %s", html)
		}
		if !strings.Contains(html, "<li>Item one</li>") {
			t.Errorf("should contain list item, got: %s", html)
		}
		if len(toc) != 1 || toc[0].ID != "overview" {
			t.Errorf("TOC should have one entry with ID 'overview', got: %v", toc)
		}
	})

	t.Run("HTML passthrough", func(t *testing.T) {
		source := []byte("## Test {#test}\n\n<div class=\"tip\">\n<strong>Tip:</strong> Some advice.\n</div>\n")
		html, _, err := renderDocsMarkdown(source)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(html, `<div class="tip">`) {
			t.Errorf("should pass through HTML blocks, got: %s", html)
		}
	})

	t.Run("heading IDs", func(t *testing.T) {
		source := []byte("## Overview {#overview}\n\n### Step 1 {#step1}\n\nContent.\n")
		html, toc, err := renderDocsMarkdown(source)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(html, `id="overview"`) {
			t.Errorf("should have h2 with id=overview, got: %s", html)
		}
		if !strings.Contains(html, `id="step1"`) {
			t.Errorf("should have h3 with id=step1, got: %s", html)
		}
		if len(toc) != 2 {
			t.Fatalf("expected 2 TOC entries, got %d", len(toc))
		}
		if toc[0].Level != 2 || toc[0].ID != "overview" {
			t.Errorf("first TOC entry: level=%d id=%q", toc[0].Level, toc[0].ID)
		}
		if toc[1].Level != 3 || toc[1].ID != "step1" {
			t.Errorf("second TOC entry: level=%d id=%q", toc[1].Level, toc[1].ID)
		}
	})

	t.Run("section wrapping", func(t *testing.T) {
		source := []byte("## First {#first}\n\nContent one.\n\n## Second {#second}\n\nContent two.\n")
		html, _, err := renderDocsMarkdown(source)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.Contains(html, `<section id="first" class="doc-section">`) {
			t.Errorf("should wrap first h2 in section, got: %s", html)
		}
		if !strings.Contains(html, `<section id="second" class="doc-section">`) {
			t.Errorf("should wrap second h2 in section, got: %s", html)
		}
		// Sections should be closed
		if strings.Count(html, "<section") != strings.Count(html, "</section>") {
			t.Errorf("section open/close mismatch")
		}
	})

	t.Run("skips headings without ID", func(t *testing.T) {
		source := []byte("## With ID {#with-id}\n\n### No ID\n\nContent.\n")
		_, toc, err := renderDocsMarkdown(source)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(toc) != 1 {
			t.Errorf("expected 1 TOC entry (skipping headings without ID), got %d", len(toc))
		}
	})
}

func TestRenderTOC(t *testing.T) {
	entries := []TOCEntry{
		{ID: "overview", Text: "Overview", Level: 2},
		{ID: "step1", Text: "Step 1", Level: 3},
		{ID: "step2", Text: "Step 2", Level: 3},
		{ID: "recovering", Text: "Recovering", Level: 2},
	}

	html := renderTOC(entries)

	if !strings.Contains(html, `<li><a href="#overview">Overview</a></li>`) {
		t.Errorf("should contain h2 as top-level li, got: %s", html)
	}
	if !strings.Contains(html, `<li class="indent"><a href="#step1">Step 1</a></li>`) {
		t.Errorf("should contain h3 as indent li, got: %s", html)
	}
	if !strings.Contains(html, `<li><a href="#recovering">Recovering</a></li>`) {
		t.Errorf("should contain second h2, got: %s", html)
	}
}

func TestGenerateDocsHTMLEnglish(t *testing.T) {
	html := GenerateDocsHTML("v1.0.0", "https://example.com/download", "en")

	// Should be valid HTML
	if !strings.Contains(html, "<!DOCTYPE html>") {
		t.Error("should contain DOCTYPE")
	}
	if !strings.Contains(html, `<html lang="en">`) {
		t.Error("should have lang=en")
	}

	// No leftover placeholders (except {{}} in JS code)
	for _, placeholder := range []string{
		"{{STYLES}}", "{{LANG}}", "{{PAGE_TITLE}}", "{{PAGE_SUBTITLE}}",
		"{{NAV_HOME}}", "{{NAV_CREATE}}", "{{TOC_TITLE}}", "{{TOC}}",
		"{{DOCS_CONTENT}}", "{{FOOTER_SOURCE}}", "{{FOOTER_HOME}}",
	} {
		if strings.Contains(html, placeholder) {
			t.Errorf("leftover placeholder: %s", placeholder)
		}
	}

	// Key content should be present
	if !strings.Contains(html, "ReMemory Guide") {
		t.Error("should contain page title")
	}
	if !strings.Contains(html, `id="overview"`) {
		t.Error("should contain overview section")
	}
	if !strings.Contains(html, `class="toc"`) {
		t.Error("should contain TOC")
	}
}

func TestGenerateDocsHTMLSpanish(t *testing.T) {
	html := GenerateDocsHTML("v1.0.0", "https://example.com/download", "es")

	if !strings.Contains(html, `<html lang="es">`) {
		t.Error("should have lang=es")
	}
	if !strings.Contains(html, "Cómo usar ReMemory") {
		t.Error("should contain Spanish page title")
	}
	// Section IDs should be the same (English) regardless of language
	if !strings.Contains(html, `id="overview"`) {
		t.Error("should contain overview section with English ID")
	}
}

func TestGenerateDocsHTMLFallback(t *testing.T) {
	html := GenerateDocsHTML("v1.0.0", "https://example.com/download", "xx")

	// Should fall back to English
	if !strings.Contains(html, `<html lang="en">`) {
		t.Error("should fall back to lang=en for unknown language")
	}
	if !strings.Contains(html, "ReMemory Guide") {
		t.Error("should contain English title after fallback")
	}
}

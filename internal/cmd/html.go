package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/eljojo/rememory/internal/html"
	"github.com/spf13/cobra"
)

var htmlCmd = &cobra.Command{
	Use:   "html [about|create|docs|recover|site]",
	Short: "Generate standalone HTML files for static hosting",
	Long: `Generate standalone HTML files that can be hosted on a static website.

Commands:
  about    Generate about.html (landing page)
  create   Generate maker.html (bundle creation tool)
  docs     Generate docs.html (documentation page)
  recover  Generate recover.html (recovery tool for collecting shares)
  site     Generate all files into a directory (use -o to set output dir)

The create and recover HTML files are self-contained with embedded WASM binary,
JavaScript, and CSS. They work fully offline.

Examples:
  rememory html about > about.html
  rememory html create > maker.html
  rememory html docs > docs.html
  rememory html recover > recover.html
  rememory html site -o dist/`,
	Args: cobra.ExactArgs(1),
	RunE: runHTML,
}

var htmlOutputFile string
var htmlLang string

func init() {
	htmlCmd.Flags().StringVarP(&htmlOutputFile, "output", "o", "", "Output file path (default: stdout)")
	htmlCmd.Flags().Bool("no-timelock", false, "Omit time-lock support from recover.html")
	htmlCmd.Flags().StringVar(&htmlLang, "lang", "", "Language code for docs (e.g. es, de)")
	rootCmd.AddCommand(htmlCmd)
}

func runHTML(cmd *cobra.Command, args []string) error {
	subcommand := args[0]

	html.SetVersion(version)
	html.SetBuildDate(buildDate)

	var content string

	switch subcommand {
	case "about", "index":
		// Generate about.html (landing page). "index" kept as alias.
		content = html.GenerateIndexHTML(false)

	case "docs":
		// Generate docs.html (documentation page)
		content = html.GenerateDocsHTML(htmlLang, false)

	case "recover":
		// Generate generic recover.html (without personalization)
		// Uses native JavaScript crypto (no WASM)
		noTlock, _ := cmd.Flags().GetBool("no-timelock")
		content = html.GenerateRecoverHTML(nil, html.RecoverHTMLOptions{NoTlock: noTlock})

	case "create":
		// Generate maker.html (bundle creation tool)
		// Uses create.wasm which self-contains recover.wasm for generating bundles
		// Tlock encryption is always included (offline — no HTTP calls)
		createWASM := html.GetCreateWASMBytes()
		if len(createWASM) == 0 {
			return fmt.Errorf("create.wasm not embedded - rebuild with 'make build'")
		}
		content = html.GenerateMakerHTML(createWASM, html.MakerHTMLOptions{})

	case "site":
		return runHTMLSite(cmd)

	default:
		return fmt.Errorf("unknown subcommand: %s (use 'about', 'create', 'docs', 'recover', or 'site')", subcommand)
	}

	// Output to file or stdout
	if htmlOutputFile != "" {
		if err := os.WriteFile(htmlOutputFile, []byte(content), 0644); err != nil {
			return fmt.Errorf("writing file: %w", err)
		}
		fmt.Fprintf(os.Stderr, "Generated %s (%s)\n", htmlOutputFile, formatSize(int64(len(content))))
	} else {
		fmt.Print(content)
	}

	return nil
}

// runHTMLSite generates all HTML files into a directory.
func runHTMLSite(cmd *cobra.Command) error {
	dir := htmlOutputFile
	if dir == "" {
		dir = "dist"
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("creating output directory: %w", err)
	}

	// Generate each file
	type file struct {
		name    string
		content string
	}

	noTlock, _ := cmd.Flags().GetBool("no-timelock")

	createWASM := html.GetCreateWASMBytes()
	if len(createWASM) == 0 {
		return fmt.Errorf("create.wasm not embedded - rebuild with 'make build'")
	}

	aboutHTML := html.GenerateIndexHTML(false)
	files := []file{
		{"about.html", aboutHTML},
		{"index.html", aboutHTML}, // Copy for GitHub Pages root URL
		{"maker.html", html.GenerateMakerHTML(createWASM, html.MakerHTMLOptions{})},
		{"docs.html", html.GenerateDocsHTML("en", false)},
		{"recover.html", html.GenerateRecoverHTML(nil, html.RecoverHTMLOptions{NoTlock: noTlock})},
	}

	// Add translated docs
	for _, lang := range html.DocsLanguages() {
		name := fmt.Sprintf("docs.%s.html", lang)
		files = append(files, file{name, html.GenerateDocsHTML(lang, false)})
	}

	for _, f := range files {
		path := filepath.Join(dir, f.name)
		if err := os.WriteFile(path, []byte(f.content), 0644); err != nil {
			return fmt.Errorf("writing %s: %w", f.name, err)
		}
		fmt.Fprintf(os.Stderr, "  %s (%s)\n", f.name, formatSize(int64(len(f.content))))
	}

	// Copy screenshots if the directory exists
	screenshotsDir := "docs/screenshots"
	if info, err := os.Stat(screenshotsDir); err == nil && info.IsDir() {
		destDir := filepath.Join(dir, "screenshots")
		if err := copyPNGs(screenshotsDir, destDir); err != nil {
			return fmt.Errorf("copying screenshots: %w", err)
		}
	}

	fmt.Fprintf(os.Stderr, "Generated %s/ site\n", dir)
	return nil
}

// copyPNGs recursively copies .png files from src to dst, preserving directory structure.
func copyPNGs(src, dst string) error {
	return filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		destPath := filepath.Join(dst, rel)

		if info.IsDir() {
			return os.MkdirAll(destPath, 0755)
		}

		if filepath.Ext(path) != ".png" {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(destPath, data, 0644)
	})
}

package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/html"
	"github.com/spf13/cobra"
)

var htmlCmd = &cobra.Command{
	Use:   "html [index|create|docs|recover|site]",
	Short: "Generate standalone HTML files for static hosting",
	Long: `Generate standalone HTML files that can be hosted on a static website.

Commands:
  index    Generate index.html (landing page)
  create   Generate maker.html (bundle creation tool)
  docs     Generate docs.html (documentation page)
  recover  Generate recover.html (recovery tool for collecting shares)
  site     Generate all files into a directory (use -o to set output dir)

The create and recover HTML files are self-contained with embedded WASM binary,
JavaScript, and CSS. They work fully offline.

Examples:
  rememory html index > index.html
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
	htmlCmd.Flags().Bool("no-timelock", false, "Omit time-lock support")
	htmlCmd.Flags().StringVar(&htmlLang, "lang", "", "Language code for docs (e.g. es, de)")
	rootCmd.AddCommand(htmlCmd)
}

func runHTML(cmd *cobra.Command, args []string) error {
	subcommand := args[0]

	var content string
	// Use specific release URL if version is a tag, otherwise use latest
	var githubURL string
	if strings.HasPrefix(version, "v") {
		githubURL = fmt.Sprintf("%s/releases/tag/%s", core.GitHubRepo, version)
	} else {
		githubURL = core.GitHubRepo + "/releases/latest"
	}

	switch subcommand {
	case "index":
		// Generate index.html (landing page)
		content = html.GenerateIndexHTML(version, githubURL)

	case "docs":
		// Generate docs.html (documentation page)
		content = html.GenerateDocsHTML(version, githubURL, htmlLang)

	case "recover":
		// Generate generic recover.html (without personalization)
		// Uses native JavaScript crypto (no WASM)
		noTlock, _ := cmd.Flags().GetBool("no-timelock")
		content = html.GenerateRecoverHTML(version, githubURL, nil, html.RecoverHTMLOptions{NoTlock: noTlock})

	case "create":
		// Generate maker.html (bundle creation tool)
		// Uses create.wasm which self-contains recover.wasm for generating bundles
		createWASM := html.GetCreateWASMBytes()
		if len(createWASM) == 0 {
			return fmt.Errorf("create.wasm not embedded - rebuild with 'make build'")
		}
		noTlock, _ := cmd.Flags().GetBool("no-timelock")
		content = html.GenerateMakerHTML(createWASM, version, githubURL, noTlock)

	case "site":
		return runHTMLSite(cmd, githubURL)

	default:
		return fmt.Errorf("unknown subcommand: %s (use 'index', 'create', 'docs', 'recover', or 'site')", subcommand)
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
func runHTMLSite(cmd *cobra.Command, githubURL string) error {
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

	files := []file{
		{"index.html", html.GenerateIndexHTML(version, githubURL)},
		{"maker.html", html.GenerateMakerHTML(createWASM, version, githubURL, noTlock)},
		{"docs.html", html.GenerateDocsHTML(version, githubURL, "en")},
		{"recover.html", html.GenerateRecoverHTML(version, githubURL, nil, html.RecoverHTMLOptions{NoTlock: noTlock})},
	}

	// Add translated docs
	for _, lang := range html.DocsLanguages() {
		name := fmt.Sprintf("docs.%s.html", lang)
		files = append(files, file{name, html.GenerateDocsHTML(version, githubURL, lang)})
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

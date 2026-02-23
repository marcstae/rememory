package cmd

import (
	"fmt"
	"os"
	"strings"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/html"
	"github.com/spf13/cobra"
)

var htmlCmd = &cobra.Command{
	Use:   "html [index|create|docs|recover]",
	Short: "Generate standalone HTML files for static hosting",
	Long: `Generate standalone HTML files that can be hosted on a static website.

Commands:
  index    Generate index.html (landing page)
  create   Generate maker.html (bundle creation tool)
  docs     Generate docs.html (documentation page)
  recover  Generate recover.html (recovery tool for collecting shares)

The create and recover HTML files are self-contained with embedded WASM binary,
JavaScript, and CSS. They work fully offline.

Examples:
  rememory html index > index.html
  rememory html create > maker.html
  rememory html docs > docs.html
  rememory html recover > recover.html`,
	Args: cobra.ExactArgs(1),
	RunE: runHTML,
}

var htmlOutputFile string

func init() {
	htmlCmd.Flags().StringVarP(&htmlOutputFile, "output", "o", "", "Output file path (default: stdout)")
	htmlCmd.Flags().Bool("no-timelock", false, "Omit time-lock support")
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
		content = html.GenerateDocsHTML(version, githubURL)

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

	default:
		return fmt.Errorf("unknown subcommand: %s (use 'index', 'create', 'docs', or 'recover')", subcommand)
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

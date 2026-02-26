package cmd

import (
	"fmt"
	"os"

	"github.com/eljojo/rememory/internal/html"
	"github.com/eljojo/rememory/internal/project"
)

// generatePages creates output/pages/ with recover.html and MANIFEST.age for static hosting.
func generatePages(p *project.Project) error {
	pagesDir := p.PagesPath()
	if err := os.MkdirAll(pagesDir, 0755); err != nil {
		return fmt.Errorf("creating pages directory: %w", err)
	}

	// Copy MANIFEST.age
	manifestData, err := os.ReadFile(p.ManifestAgePath())
	if err != nil {
		return fmt.Errorf("reading manifest: %w", err)
	}
	manifestDest := pagesDir + "/MANIFEST.age"
	if err := os.WriteFile(manifestDest, manifestData, 0644); err != nil {
		return fmt.Errorf("writing manifest to pages: %w", err)
	}

	// Generate recover.html for static hosting.
	// Tlock support is always included so the page can handle any manifest type.
	html.SetVersion(version)
	html.SetBuildDate(buildDate)
	recoverHTML := html.GenerateRecoverHTML(nil, html.RecoverHTMLOptions{
		StaticHosted: true,
	})
	recoverDest := pagesDir + "/recover.html"
	if err := os.WriteFile(recoverDest, []byte(recoverHTML), 0644); err != nil {
		return fmt.Errorf("writing recover.html to pages: %w", err)
	}

	fmt.Printf("\nStatic pages saved to: %s\n", pagesDir)
	return nil
}

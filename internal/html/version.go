package html

import (
	"fmt"
	"strings"

	"github.com/eljojo/rememory/internal/core"
)

// pkgVersion is the rememory version string, set once at startup via SetVersion.
var pkgVersion string

// pkgBuildDate is the build date (YYYY-MM-DD), set once at startup via SetBuildDate.
var pkgBuildDate string

// SetVersion sets the package-level version used by all Generate functions.
// Call this once at startup before generating any HTML.
func SetVersion(v string) {
	pkgVersion = v
}

// SetBuildDate sets the package-level build date used by HTML generation.
// Call this once at startup before generating any HTML.
func SetBuildDate(d string) {
	pkgBuildDate = d
}

// githubURL derives the GitHub release URL from pkgVersion.
// Tagged versions link to their specific release; other values link to latest.
func githubURL() string {
	if strings.HasPrefix(pkgVersion, "v") {
		return fmt.Sprintf("%s/releases/tag/%s", core.GitHubRepo, pkgVersion)
	}
	return core.GitHubRepo + "/releases/latest"
}

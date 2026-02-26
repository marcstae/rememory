package cmd

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
)

// version and buildDate are set at build time via -ldflags
var version = "dev"
var buildDate = ""

var rootCmd = &cobra.Command{
	Use:   "rememory",
	Short: "🧠 Encrypt secrets and split access among trusted friends",
	Long: `🧠 ReMemory encrypts a manifest of secrets with age, splits the passphrase
using Shamir's Secret Sharing, and creates recovery bundles for trusted friends.

Create a project:    rememory init my-recovery
Seal the manifest:   rememory seal
Recover from shares: rememory recover bundle-alice.zip bundle-bob.zip`,
}

func Execute(v, bd string) error {
	version = v
	buildDate = bd
	rootCmd.Version = v
	err := rootCmd.Execute()
	if err == nil {
		checkBuildAge()
	}
	return err
}

// checkBuildAge prints a gentle nudge to stderr if the build is more than 6 months old.
func checkBuildAge() {
	if buildDate == "" {
		return
	}
	built, err := time.Parse("2006-01-02", buildDate)
	if err != nil {
		return
	}
	if time.Since(built) < 180*24*time.Hour {
		return
	}
	fmt.Fprintf(os.Stderr, "\n%s You're running version %s, from %s.\n", yellow("A newer version may be available."), version, buildDate)
	fmt.Fprintf(os.Stderr, "  Check https://github.com/eljojo/rememory/releases/latest\n\n")
}

// Color helpers (ANSI escape codes)
func green(s string) string {
	return "\033[32m" + s + "\033[0m"
}

func yellow(s string) string {
	return "\033[33m" + s + "\033[0m"
}

func red(s string) string {
	return "\033[31m" + s + "\033[0m"
}

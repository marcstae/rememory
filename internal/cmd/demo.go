package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/eljojo/rememory/internal/project"
	"github.com/spf13/cobra"
)

var demoCmd = &cobra.Command{
	Use:   "demo [directory]",
	Short: "Create a demo project with sample data",
	Long: `Create a complete demo project with sample friends and secret files.

This is useful for testing the recovery workflow or demonstrating ReMemory.

The demo project includes:
  - 5 friends: Alice, Bob, Camila (Spanish), Dominique (French), Elias (German)
  - Threshold of 3 (any 3 friends can recover)
  - Sample secret files in the manifest
  - Fully sealed and bundled, ready to test
  - Camila, Dominique, and Elias's bundles are in their language

Example:
  rememory demo
  rememory demo my-demo-project`,
	Args: cobra.MaximumNArgs(1),
	RunE: runDemo,
}

func init() {
	demoCmd.Flags().String("timelock", "", "Time-lock duration or date (e.g., 5min, 30d, 1y, 2027-06-15T00:00:00Z)")
	demoCmd.Flags().Bool("pages", false, "Generate a static pages directory (recover.html + MANIFEST.age) for hosting")
	rootCmd.AddCommand(demoCmd)
}

func runDemo(cmd *cobra.Command, args []string) error {
	// Determine project directory
	dirName := "demo-recovery"
	if len(args) > 0 {
		dirName = args[0]
	}

	dir, err := filepath.Abs(dirName)
	if err != nil {
		return fmt.Errorf("resolving path: %w", err)
	}

	// Check if directory already exists
	if _, err := os.Stat(dir); err == nil {
		return fmt.Errorf("directory already exists: %s", dir)
	}

	fmt.Printf("Creating demo project: %s/\n\n", dirName)

	// Demo friends
	friends := []project.Friend{
		{Name: "Alice", Contact: "alice@example.com"},
		{Name: "Bob", Contact: "bob@example.com"},
		{Name: "Camila", Contact: "camila@example.com", Language: "es"},
		{Name: "Dominique", Contact: "dominique@example.com", Language: "fr"},
		{Name: "Elias", Contact: "elias@example.com", Language: "de"},
	}
	threshold := 3

	fmt.Printf("Friends: %s\n", friendNames(friends))
	fmt.Printf("Threshold: %d of %d\n\n", threshold, len(friends))

	// Create the project
	p, err := project.New(dir, "Demo Project", threshold, friends)
	if err != nil {
		return fmt.Errorf("creating project: %w", err)
	}

	// Write the manifest README template
	if err := project.WriteManifestReadme(p.ManifestPath(), project.TemplateDataFromProject(p)); err != nil {
		return fmt.Errorf("creating manifest README: %w", err)
	}

	// Add demo secret files
	manifestDir := p.ManifestPath()

	demoSecretContent := `# Demo Secret File

This is a demonstration of ReMemory's secret recovery system.

In a real scenario, this file might contain:
- Password manager recovery codes
- Cryptocurrency seed phrases
- Important account credentials
- Instructions for loved ones

Remember: This file will be encrypted and can only be recovered
when enough friends combine their shares.
`
	if err := os.WriteFile(filepath.Join(manifestDir, "demo-secret.txt"), []byte(demoSecretContent), 0600); err != nil {
		return fmt.Errorf("writing demo secret: %w", err)
	}

	passwordsContent := `# Example Passwords (DEMO ONLY)

Email: demo@example.com
Password: correct-horse-battery-staple

Bank PIN: 1234

WiFi Password: DemoNetwork2024

Note: In a real project, these would be your actual sensitive credentials.
`
	if err := os.WriteFile(filepath.Join(manifestDir, "passwords.txt"), []byte(passwordsContent), 0600); err != nil {
		return fmt.Errorf("writing passwords file: %w", err)
	}

	fmt.Println("Created demo files:")
	fmt.Printf("  %s manifest/demo-secret.txt\n", green("✓"))
	fmt.Printf("  %s manifest/passwords.txt\n", green("✓"))
	fmt.Println()

	timelockStr, _ := cmd.Flags().GetString("timelock")
	pages, _ := cmd.Flags().GetBool("pages")

	if err := sealProject(p, false, timelockStr); err != nil {
		return err
	}

	if pages {
		if err := generatePages(p); err != nil {
			return err
		}
	}

	fmt.Println()
	fmt.Println("Demo project created successfully!")
	fmt.Println()
	fmt.Println("To test recovery:")
	fmt.Printf("  1. Open %s/output/bundles/bundle-alice.zip\n", dirName)
	fmt.Println("  2. Extract and open recover.html in a browser")
	fmt.Println("  3. Alice's piece is pre-loaded — add two more README files to reach the threshold")
	fmt.Println("  4. Recovery will happen automatically")
	fmt.Println()
	fmt.Println("Camila, Dominique, and Elias's bundles are in their language — check bundle-camila.zip to see.")

	return nil
}

package main

import (
	"os"

	"github.com/eljojo/rememory/internal/cmd"
)

var version = "dev"
var buildDate = ""

func main() {
	if err := cmd.Execute(version, buildDate); err != nil {
		os.Exit(1)
	}
}

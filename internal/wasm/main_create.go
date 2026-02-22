//go:build js && wasm && create

package main

import (
	"syscall/js"
)

func main() {
	// Register recovery functions (also needed for creation tool's recovery preview)
	js.Global().Set("rememoryParseShare", js.FuncOf(parseShareJS))
	js.Global().Set("rememoryCombineShares", js.FuncOf(combineSharesJS))
	js.Global().Set("rememoryDecryptManifest", js.FuncOf(decryptManifestJS))
	js.Global().Set("rememoryExtractArchive", js.FuncOf(extractArchiveJS))
	js.Global().Set("rememoryExtractBundle", js.FuncOf(extractBundleJS))
	js.Global().Set("rememoryParseCompactShare", js.FuncOf(parseCompactShareJS))
	js.Global().Set("rememoryDecodeWords", js.FuncOf(decodeWordsJS))

	// Register bundle creation functions
	js.Global().Set("rememoryCreateArchive", js.FuncOf(createArchiveJS))
	js.Global().Set("rememoryCreateBundlesFromArchive", js.FuncOf(createBundlesFromArchiveJS))
	js.Global().Set("rememoryParseProjectYAML", js.FuncOf(parseProjectYAMLJS))

	// Signal that WASM is ready
	js.Global().Set("rememoryReady", true)

	// Keep the Go program running
	select {}
}

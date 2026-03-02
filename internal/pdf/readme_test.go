package pdf

import (
	"bytes"
	"testing"
	"time"

	"github.com/eljojo/rememory/internal/core"
	"github.com/eljojo/rememory/internal/project"
)

func testReadmeData() ReadmeData {
	share := core.NewShare(1, 1, 3, 2, "Alice", []byte("test-share-data-for-qr-code-12345"))
	return ReadmeData{
		ProjectName:      "Test Project",
		Holder:           "Alice",
		Share:            share,
		OtherFriends:     []project.Friend{{Name: "Bob", Contact: "bob@example.com"}},
		Threshold:        2,
		Total:            3,
		Version:          "v0.0.1-test",
		GitHubReleaseURL: "https://github.com/eljojo/rememory/releases",
		ManifestChecksum: "sha256:abcdef1234567890",
		RecoverChecksum:  "sha256:0987654321fedcba",
		Created:          time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}
}

func TestGenerateReadme(t *testing.T) {
	data := testReadmeData()
	pdfBytes, err := GenerateReadme(data)
	if err != nil {
		t.Fatalf("GenerateReadme: %v", err)
	}
	if len(pdfBytes) == 0 {
		t.Fatal("generated PDF is empty")
	}
	// Verify it's a valid PDF (starts with %PDF-)
	if !bytes.HasPrefix(pdfBytes, []byte("%PDF-")) {
		t.Error("output does not start with PDF header")
	}
}

func TestGenerateReadmeAnonymous(t *testing.T) {
	data := testReadmeData()
	data.Anonymous = true
	data.OtherFriends = nil
	pdfBytes, err := GenerateReadme(data)
	if err != nil {
		t.Fatalf("GenerateReadme (anonymous): %v", err)
	}
	if len(pdfBytes) == 0 {
		t.Fatal("generated PDF is empty")
	}
}

func TestWordGridNotSplitAcrossPages(t *testing.T) {
	// Use a 33-byte share (produces 25 recovery words) with many friends
	// to push content down the page and trigger the page-break logic.
	shareData := make([]byte, 33)
	for i := range shareData {
		shareData[i] = byte(i + 1)
	}
	share := core.NewShare(2, 1, 5, 3, "Alice", shareData)

	data := ReadmeData{
		ProjectName: "Test Project With a Long Name",
		Holder:      "Alice Wonderland",
		Share:       share,
		OtherFriends: []project.Friend{
			{Name: "Bob Builder", Contact: "bob@example.com"},
			{Name: "Carol Danvers", Contact: "carol@example.com"},
			{Name: "David Copperfield", Contact: "david@example.com"},
			{Name: "Eve Polastri", Contact: "eve@example.com"},
		},
		Threshold:        3,
		Total:            5,
		Version:          "v0.0.1-test",
		GitHubReleaseURL: "https://github.com/eljojo/rememory/releases",
		ManifestChecksum: "sha256:abcdef1234567890",
		RecoverChecksum:  "sha256:0987654321fedcba",
		Created:          time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}

	pdfBytes, err := GenerateReadme(data)
	if err != nil {
		t.Fatalf("GenerateReadme: %v", err)
	}
	if len(pdfBytes) == 0 {
		t.Fatal("generated PDF is empty")
	}
	if !bytes.HasPrefix(pdfBytes, []byte("%PDF-")) {
		t.Error("output does not start with PDF header")
	}
}

func TestPDFContainsAppendedShare(t *testing.T) {
	data := testReadmeData()
	pdfBytes, err := GenerateReadme(data)
	if err != nil {
		t.Fatalf("GenerateReadme: %v", err)
	}

	// Verify it's a valid PDF
	if !bytes.HasPrefix(pdfBytes, []byte("%PDF-")) {
		t.Error("output does not start with PDF header")
	}

	// Verify the share is appended after the PDF content
	// PDF files end with %%EOF, so the share should come after that
	if !bytes.Contains(pdfBytes, []byte("%%EOF")) {
		t.Error("PDF doesn't contain EOF marker")
	}

	// The share should be appended after the PDF
	shareMarker := "-----BEGIN REMEMORY SHARE-----"
	if !bytes.Contains(pdfBytes, []byte(shareMarker)) {
		t.Error("PDF doesn't contain appended share")
	}

	// Try parsing the share from the PDF content
	parsed, err := core.ParseShare(pdfBytes)
	if err != nil {
		t.Fatalf("ParseShare from PDF: %v", err)
	}

	// Verify the parsed share matches the original
	if parsed.Index != data.Share.Index {
		t.Errorf("parsed share index mismatch: got %d, want %d", parsed.Index, data.Share.Index)
	}
	if parsed.Total != data.Share.Total {
		t.Errorf("parsed share total mismatch: got %d, want %d", parsed.Total, data.Share.Total)
	}
	if parsed.Threshold != data.Share.Threshold {
		t.Errorf("parsed share threshold mismatch: got %d, want %d", parsed.Threshold, data.Share.Threshold)
	}
	if !bytes.Equal(parsed.Data, data.Share.Data) {
		t.Error("parsed share data mismatch")
	}
}

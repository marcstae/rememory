package core

import (
	"archive/zip"
	"bytes"
	"testing"
)

func TestBuildOpenRoundtrip(t *testing.T) {
	meta := &TlockMeta{
		V:      TlockContainerVersion,
		Method: TlockMethodQuicknet,
		Round:  12345678,
		Unlock: "2027-06-15T00:00:00Z",
		Chain:  QuicknetChainHash,
	}
	ciphertext := []byte("tlock-encrypted-data-here")

	data, err := BuildTlockContainer(meta, ciphertext)
	if err != nil {
		t.Fatalf("BuildTlockContainer: %v", err)
	}

	parsed, inner, err := OpenTlockContainer(data)
	if err != nil {
		t.Fatalf("OpenTlockContainer: %v", err)
	}

	if parsed.V != meta.V {
		t.Errorf("V: got %d, want %d", parsed.V, meta.V)
	}
	if parsed.Method != meta.Method {
		t.Errorf("Method: got %q, want %q", parsed.Method, meta.Method)
	}
	if parsed.Round != meta.Round {
		t.Errorf("Round: got %d, want %d", parsed.Round, meta.Round)
	}
	if parsed.Unlock != meta.Unlock {
		t.Errorf("Unlock: got %q, want %q", parsed.Unlock, meta.Unlock)
	}
	if parsed.Chain != meta.Chain {
		t.Errorf("Chain: got %q, want %q", parsed.Chain, meta.Chain)
	}
	if !bytes.Equal(inner, ciphertext) {
		t.Errorf("ciphertext mismatch: got %q, want %q", inner, ciphertext)
	}
}

func TestIsTlockContainer(t *testing.T) {
	// Build a real tlock container
	meta := &TlockMeta{
		V:      TlockContainerVersion,
		Method: TlockMethodQuicknet,
		Round:  100,
		Unlock: "2027-01-01T00:00:00Z",
		Chain:  "abc",
	}
	tlockZip, err := BuildTlockContainer(meta, []byte("cipher"))
	if err != nil {
		t.Fatalf("BuildTlockContainer: %v", err)
	}

	// Build a regular ZIP (no tlock.json)
	var regularBuf bytes.Buffer
	w := zip.NewWriter(&regularBuf)
	f, _ := w.Create("hello.txt")
	f.Write([]byte("world"))
	w.Close()
	regularZip := regularBuf.Bytes()

	tests := []struct {
		name string
		data []byte
		want bool
	}{
		{"tlock container", tlockZip, true},
		{"regular zip", regularZip, false},
		{"age file", []byte("age-encryption.org/v1\n-> scrypt"), false},
		{"empty", []byte{}, false},
		{"nil", nil, false},
		{"random bytes", []byte{0xDE, 0xAD, 0xBE, 0xEF}, false},
		{"tar.gz magic", []byte{0x1F, 0x8B, 0x08, 0x00}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := IsTlockContainer(tt.data)
			if got != tt.want {
				t.Errorf("IsTlockContainer: got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestOpenTlockContainerMissingJSON(t *testing.T) {
	// ZIP with manifest.tlock.age but no tlock.json
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, _ := w.Create("manifest.tlock.age")
	f.Write([]byte("cipher"))
	w.Close()

	_, _, err := OpenTlockContainer(buf.Bytes())
	if err == nil {
		t.Fatal("expected error for missing tlock.json")
	}
}

func TestOpenTlockContainerMissingManifest(t *testing.T) {
	// ZIP with tlock.json but no manifest.tlock.age
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, _ := w.Create("tlock.json")
	f.Write([]byte(`{"v":1,"method":"drand-quicknet","round":100,"unlock":"2027-01-01T00:00:00Z","chain":"abc"}`))
	w.Close()

	_, _, err := OpenTlockContainer(buf.Bytes())
	if err == nil {
		t.Fatal("expected error for missing manifest.tlock.age")
	}
}

func TestTlockMetaUnlockTime(t *testing.T) {
	meta := &TlockMeta{
		Unlock: "2027-06-15T00:00:00Z",
	}
	ut, err := meta.UnlockTime()
	if err != nil {
		t.Fatalf("UnlockTime: %v", err)
	}
	if ut.Year() != 2027 || ut.Month() != 6 || ut.Day() != 15 {
		t.Errorf("unexpected time: %v", ut)
	}
}

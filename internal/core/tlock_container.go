package core

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"
)

// TlockContainerVersion is the current tlock container format version.
const TlockContainerVersion = 1

// Filenames inside the tlock container ZIP.
const (
	tlockContainerMetaFile   = "tlock.json"
	tlockContainerCipherFile = "manifest.tlock.age"
)

// TlockMeta holds the tlock-specific metadata stored inside the container.
type TlockMeta struct {
	V      int    `json:"v"`
	Method string `json:"method"`
	Round  uint64 `json:"round"`
	Unlock string `json:"unlock"` // RFC 3339 timestamp
	Chain  string `json:"chain"`
}

// UnlockTime parses the Unlock field as a time.Time.
func (t *TlockMeta) UnlockTime() (time.Time, error) {
	return time.Parse(time.RFC3339, t.Unlock)
}

// BuildTlockContainer creates a ZIP containing tlock.json and manifest.tlock.age.
// The resulting ZIP is meant to be age-encrypted as the outer layer.
func BuildTlockContainer(meta *TlockMeta, tlockCiphertext []byte) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	// Write tlock.json
	metaBytes, err := json.Marshal(meta)
	if err != nil {
		return nil, fmt.Errorf("tlock container: encoding metadata: %w", err)
	}
	mf, err := w.Create(tlockContainerMetaFile)
	if err != nil {
		return nil, fmt.Errorf("tlock container: creating %s: %w", tlockContainerMetaFile, err)
	}
	if _, err := mf.Write(metaBytes); err != nil {
		return nil, fmt.Errorf("tlock container: writing %s: %w", tlockContainerMetaFile, err)
	}

	// Write manifest.tlock.age
	cf, err := w.Create(tlockContainerCipherFile)
	if err != nil {
		return nil, fmt.Errorf("tlock container: creating %s: %w", tlockContainerCipherFile, err)
	}
	if _, err := cf.Write(tlockCiphertext); err != nil {
		return nil, fmt.Errorf("tlock container: writing %s: %w", tlockContainerCipherFile, err)
	}

	if err := w.Close(); err != nil {
		return nil, fmt.Errorf("tlock container: closing zip: %w", err)
	}

	return buf.Bytes(), nil
}

// OpenTlockContainer reads a tlock container ZIP and returns the metadata
// and the tlock-encrypted ciphertext.
func OpenTlockContainer(data []byte) (*TlockMeta, []byte, error) {
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, nil, fmt.Errorf("tlock container: opening zip: %w", err)
	}

	var metaBytes []byte
	var cipherBytes []byte

	for _, f := range r.File {
		switch f.Name {
		case tlockContainerMetaFile:
			metaBytes, err = readZipFile(f)
			if err != nil {
				return nil, nil, fmt.Errorf("tlock container: reading %s: %w", tlockContainerMetaFile, err)
			}
		case tlockContainerCipherFile:
			cipherBytes, err = readZipFile(f)
			if err != nil {
				return nil, nil, fmt.Errorf("tlock container: reading %s: %w", tlockContainerCipherFile, err)
			}
		}
	}

	if metaBytes == nil {
		return nil, nil, errors.New("tlock container: missing tlock.json")
	}
	if cipherBytes == nil {
		return nil, nil, errors.New("tlock container: missing manifest.tlock.age")
	}

	var meta TlockMeta
	if err := json.Unmarshal(metaBytes, &meta); err != nil {
		return nil, nil, fmt.Errorf("tlock container: parsing tlock.json: %w", err)
	}
	if meta.V == 0 {
		return nil, nil, errors.New("tlock container: tlock.json missing version field")
	}

	return &meta, cipherBytes, nil
}

// IsTlockContainer returns true if data looks like a tlock container ZIP.
// It checks for the ZIP magic bytes and the presence of a tlock.json entry.
func IsTlockContainer(data []byte) bool {
	// ZIP magic: PK\x03\x04
	if len(data) < 4 || data[0] != 0x50 || data[1] != 0x4B || data[2] != 0x03 || data[3] != 0x04 {
		return false
	}
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return false
	}
	for _, f := range r.File {
		if f.Name == tlockContainerMetaFile {
			return true
		}
	}
	return false
}

func readZipFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(rc)
}

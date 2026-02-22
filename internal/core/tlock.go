//go:build !js

package core

import (
	"errors"
	"fmt"
	"io"

	"filippo.io/age/armor"
	"github.com/drand/tlock"
	tlockhttp "github.com/drand/tlock/networks/http"
)

// IsTlockTooEarly returns true if the error wraps tlock.ErrTooEarly,
// meaning the drand round has not been reached yet.
func IsTlockTooEarly(err error) bool {
	return errors.Is(err, tlock.ErrTooEarly)
}

// TlockEncrypt encrypts src to a specific drand round number using tlock.
// The output is ASCII-armored age format for compatibility with tlock-js
// (which expects armored input in timelockDecrypt). The Go TlockDecrypt
// handles both armored and binary age format, so this is safe.
func TlockEncrypt(dst io.Writer, src io.Reader, roundNumber uint64) error {
	network, err := connectDrand()
	if err != nil {
		return fmt.Errorf("tlock encrypt: %w", err)
	}

	aw := armor.NewWriter(dst)
	if err := tlock.New(network).Encrypt(aw, src, roundNumber); err != nil {
		return fmt.Errorf("tlock encrypt: %w", err)
	}
	if err := aw.Close(); err != nil {
		return fmt.Errorf("tlock encrypt (armor): %w", err)
	}

	return nil
}

// TlockDecrypt decrypts tlock-encrypted ciphertext by fetching the drand
// beacon signature for the round embedded in the ciphertext.
// Returns tlock.ErrTooEarly if the round has not been reached yet.
func TlockDecrypt(dst io.Writer, src io.Reader) error {
	network, err := connectDrand()
	if err != nil {
		return fmt.Errorf("tlock decrypt: %w", err)
	}

	if err := tlock.New(network).Decrypt(dst, src); err != nil {
		return fmt.Errorf("tlock decrypt: %w", err)
	}

	return nil
}

// connectDrand tries each drand endpoint until one connects.
func connectDrand() (tlock.Network, error) {
	var lastErr error
	for _, endpoint := range DrandEndpoints {
		network, err := tlockhttp.NewNetwork(endpoint, QuicknetChainHash)
		if err != nil {
			lastErr = err
			continue
		}
		return network, nil
	}
	return nil, fmt.Errorf("connecting to drand: all endpoints failed (last error: %w)", lastErr)
}

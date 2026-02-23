package core

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Quicknet chain parameters (drand League of Entropy).
const (
	QuicknetChainHash = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971"
	QuicknetPeriod    = 3 * time.Second
	QuicknetGenesis   = 1692803367 // Unix timestamp: 2023-08-23T11:22:47Z
	QuicknetPublicKey = "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a"

	TlockMethodQuicknet = "drand-quicknet"
)

// DrandEndpoints lists the public drand HTTP API relays, tried in order.
// api.drand.sh is first because drand.cloudflare.com returns improper CORS
// preflight responses (missing access-control-allow-methods), which causes
// fetch failures in Safari and Firefox.
var DrandEndpoints = []string{
	"https://api.drand.sh",
	"https://api2.drand.sh",
	"https://api3.drand.sh",
	"https://drand.cloudflare.com",
}

// RoundForTime returns the drand quicknet round number that will be emitted
// at or just after the given target time.
func RoundForTime(target time.Time) uint64 {
	genesis := time.Unix(QuicknetGenesis, 0)
	if target.Before(genesis) {
		return 1
	}
	elapsed := target.Sub(genesis)
	round := uint64(math.Ceil(elapsed.Seconds()/QuicknetPeriod.Seconds())) + 1
	return round
}

// TimeForRound returns the time at which a given drand quicknet round will
// be emitted.
func TimeForRound(round uint64) time.Time {
	genesis := time.Unix(QuicknetGenesis, 0)
	if round <= 1 {
		return genesis
	}
	offset := time.Duration(round-1) * QuicknetPeriod
	return genesis.Add(offset)
}

// durationPattern matches relative duration strings like "30d", "6m", "1y", "2w", "5min", "2h".
var durationPattern = regexp.MustCompile(`^(\d+)\s*(min|[hdwmy])$`)

// ParseTimelockValue parses a human-readable timelock duration or an absolute
// ISO 8601 datetime string, returning the target unlock time.
//
// Supported formats:
//   - "5min" — 5 minutes from now
//   - "2h"   — 2 hours from now
//   - "30d"  — 30 days from now
//   - "2w"   — 2 weeks from now
//   - "6m"   — 6 months from now
//   - "1y"   — 1 year from now
//   - "2027-06-15T00:00:00Z" — absolute RFC 3339 datetime
func ParseTimelockValue(input string) (time.Time, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return time.Time{}, fmt.Errorf("empty timelock value")
	}

	// Try relative duration first
	matches := durationPattern.FindStringSubmatch(strings.ToLower(input))
	if matches != nil {
		n, err := strconv.Atoi(matches[1])
		if err != nil {
			return time.Time{}, fmt.Errorf("invalid duration number: %w", err)
		}
		if n <= 0 {
			return time.Time{}, fmt.Errorf("duration must be positive, got %d", n)
		}

		now := time.Now().UTC()
		switch matches[2] {
		case "min":
			return now.Add(time.Duration(n) * time.Minute), nil
		case "h":
			return now.Add(time.Duration(n) * time.Hour), nil
		case "d":
			return now.AddDate(0, 0, n), nil
		case "w":
			return now.AddDate(0, 0, n*7), nil
		case "m":
			return now.AddDate(0, n, 0), nil
		case "y":
			return now.AddDate(n, 0, 0), nil
		}
	}

	// Try absolute datetime (RFC 3339)
	t, err := time.Parse(time.RFC3339, input)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid timelock value %q: expected duration (5min, 2h, 30d, 2w, 6m, 1y) or RFC 3339 datetime", input)
	}

	if t.Before(time.Now()) {
		return time.Time{}, fmt.Errorf("timelock date %s is in the past", input)
	}

	return t.UTC(), nil
}

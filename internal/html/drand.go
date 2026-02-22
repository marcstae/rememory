package html

import (
	"encoding/json"
	"strings"

	"github.com/eljojo/rememory/internal/core"
)

// drandConfig is the JSON structure injected as window.DRAND_CONFIG.
// TypeScript reads this at runtime — Go is the single source of truth.
type drandConfig struct {
	ChainHash string   `json:"chainHash"`
	Genesis   int64    `json:"genesis"`
	Period    int      `json:"period"`
	PublicKey string   `json:"publicKey"`
	Endpoints []string `json:"endpoints"`
}

// drandConfigScript returns a <script> tag that sets window.DRAND_CONFIG
// from the authoritative Go constants. Placed before the tlock JS bundle
// so the config is available when the IIFE executes.
func drandConfigScript() string {
	cfg := drandConfig{
		ChainHash: core.QuicknetChainHash,
		Genesis:   core.QuicknetGenesis,
		Period:    int(core.QuicknetPeriod.Seconds()),
		PublicKey: core.QuicknetPublicKey,
		Endpoints: core.DrandEndpoints,
	}
	data, _ := json.Marshal(cfg)
	return `<script nonce="{{CSP_NONCE}}">window.DRAND_CONFIG=` + string(data) + `;</script>`
}

// drandCSPConnectSrc returns the CSP connect-src entries for drand endpoints.
// Each endpoint gets a trailing slash for CSP path matching.
func drandCSPConnectSrc() string {
	parts := make([]string, 0, len(core.DrandEndpoints)+1)
	parts = append(parts, "blob:")
	for _, ep := range core.DrandEndpoints {
		parts = append(parts, ep+"/")
	}
	return strings.Join(parts, " ")
}

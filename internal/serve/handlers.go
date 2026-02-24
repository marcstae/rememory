package serve

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"

	"github.com/eljojo/rememory/internal/html"
)

func (s *Server) handleRoot(w http.ResponseWriter, r *http.Request) {
	if !IsSetup(s.store) {
		s.handleSetupPage(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, s.generateHomeHTML())
}

func (s *Server) handleSetupPage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, s.generateSetupHTML())
}

func (s *Server) handleCreate(w http.ResponseWriter, r *http.Request) {
	if !IsSetup(s.store) {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	createWASM := html.GetCreateWASMBytes()
	if len(createWASM) == 0 {
		http.Error(w, "create.wasm not embedded — rebuild with 'make build'", http.StatusInternalServerError)
		return
	}

	content := html.GenerateMakerHTML(createWASM, s.version, s.githubURL, html.MakerHTMLOptions{
		NoTlock:    s.noTlock,
		Selfhosted: true,
		SelfhostedConfig: &html.SelfhostedConfig{
			MaxManifestSize: s.maxManifestSize,
			HasManifest:     s.store.HasManifest(),
		},
	})
	fmt.Fprint(w, content)
}

func (s *Server) handleRecover(w http.ResponseWriter, r *http.Request) {
	if !IsSetup(s.store) {
		http.Redirect(w, r, "/", http.StatusFound)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	content := html.GenerateRecoverHTML(s.version, s.githubURL, nil, html.RecoverHTMLOptions{
		NoTlock:    s.noTlock,
		Selfhosted: true,
		SelfhostedConfig: &html.SelfhostedConfig{
			MaxManifestSize: s.maxManifestSize,
			HasManifest:     s.store.HasManifest(),
		},
	})
	fmt.Fprint(w, content)
}

func (s *Server) handleAbout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	content := html.GenerateIndexHTML(s.version, s.githubURL)
	fmt.Fprint(w, content)
}

func (s *Server) handleDocs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	content := html.GenerateDocsHTML(s.version, s.githubURL, "en")
	fmt.Fprint(w, content)
}

// API handlers

func (s *Server) handleAPIStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"hasPassword":     IsSetup(s.store),
		"hasManifest":     s.store.HasManifest(),
		"maxManifestSize": s.maxManifestSize,
	})
}

func (s *Server) handleAPISetup(w http.ResponseWriter, r *http.Request) {
	if IsSetup(s.store) {
		http.Error(w, "Admin password is already set.", http.StatusConflict)
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body.", http.StatusBadRequest)
		return
	}

	if body.Password == "" {
		http.Error(w, "Password cannot be empty.", http.StatusBadRequest)
		return
	}

	if err := SetPassword(s.store, body.Password); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleAPIListBundles(w http.ResponseWriter, r *http.Request) {
	bundles, err := s.store.List()
	if err != nil {
		http.Error(w, "Could not list bundles.", http.StatusInternalServerError)
		return
	}
	if bundles == nil {
		bundles = []BundleMeta{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bundles)
}

func (s *Server) handleAPISaveBundle(w http.ResponseWriter, r *http.Request) {
	if !IsSetup(s.store) {
		http.Error(w, "Set up an admin password first.", http.StatusForbidden)
		return
	}

	// Parse multipart form (manifest file + metadata JSON)
	if err := r.ParseMultipartForm(int64(s.maxManifestSize) + 1<<20); err != nil {
		http.Error(w, "Could not parse form.", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("manifest")
	if err != nil {
		http.Error(w, "Missing manifest file.", http.StatusBadRequest)
		return
	}
	defer file.Close()

	manifest, err := io.ReadAll(io.LimitReader(file, int64(s.maxManifestSize)+1))
	if err != nil {
		http.Error(w, "Could not read manifest.", http.StatusBadRequest)
		return
	}
	if len(manifest) > s.maxManifestSize {
		http.Error(w, fmt.Sprintf("Manifest too large (%d bytes). Maximum is %d bytes.",
			len(manifest), s.maxManifestSize), http.StatusRequestEntityTooLarge)
		return
	}

	metaStr := r.FormValue("meta")
	var meta BundleMeta
	if metaStr != "" {
		if err := json.Unmarshal([]byte(metaStr), &meta); err != nil {
			http.Error(w, "Invalid metadata.", http.StatusBadRequest)
			return
		}
	}

	id, err := s.store.Save(manifest, meta)
	if err != nil {
		http.Error(w, "Could not save bundle.", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"id": id})
}

func (s *Server) handleAPIDeleteBundle(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID       string `json:"id"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body.", http.StatusBadRequest)
		return
	}

	if body.ID == "" {
		http.Error(w, "Missing bundle ID.", http.StatusBadRequest)
		return
	}

	if !CheckPassword(s.store, body.Password) {
		http.Error(w, "Wrong password.", http.StatusUnauthorized)
		return
	}

	if err := s.store.Delete(body.ID); err != nil {
		http.Error(w, "Bundle not found.", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ok": true})
}

func (s *Server) handleAPIManifest(w http.ResponseWriter, r *http.Request) {
	var bundleID string

	if id := r.URL.Query().Get("id"); id != "" {
		bundleID = id
	} else {
		// Fall back to latest bundle
		latest, err := s.store.Latest()
		if err != nil || latest == nil {
			http.Error(w, "No manifest available.", http.StatusNotFound)
			return
		}
		bundleID = latest.ID
	}

	manifestPath := s.store.ManifestPath(bundleID)
	f, err := os.Open(manifestPath)
	if err != nil {
		http.Error(w, "Manifest not found.", http.StatusNotFound)
		return
	}
	defer f.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=MANIFEST.age")
	io.Copy(w, f)
}

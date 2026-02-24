# Self-Hosting ReMemory

ReMemory can run as a web app on your own server. This is an optional add-on — the offline bundles are the primary way to use ReMemory, and they work without any server.

## What it does

`rememory serve` starts a lightweight web server that lets you:

- **Create bundles** through the web UI (the same WASM-powered creator as the standalone maker.html)
- **Store the encrypted archive** on the server, so friends only need their share (PDF/text) to recover
- **Recover** through the web UI at `/recover` — the server provides the encrypted archive automatically

The server never sees shares or decryption keys. It stores only the encrypted MANIFEST.age file and non-secret metadata (project name, friend names, threshold).

## What it doesn't do

- Replace the offline bundles. Each friend still gets their own bundle (downloaded during creation). Those bundles are self-contained and work without this server.
- Provide authentication. You should put this behind your own auth layer (see Deployment below).
- Guarantee availability. If the server goes away, friends still have their bundles.

## When to use it

- You're hosting for a group (family, team) and want a shared place to create and recover
- You already run a homelab behind authentication (Cloudflare Access, Authelia, Pocket ID)
- You want a web UI without installing the CLI

## Setup

```bash
rememory serve
```

The first visit shows a setup page where you choose an admin password. This password protects administrative actions (deleting bundles) — it doesn't affect the encryption.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port, -p` | `8080` | Port to listen on |
| `--host` | `0.0.0.0` | Host to bind to |
| `--data, -d` | `./rememory-data` | Data directory for bundles and config |
| `--max-manifest-size` | `50MB` | Maximum MANIFEST.age size (e.g. `50MB`, `1GB`) |
| `--no-timelock` | false | Omit time-lock support |

### How it works

Three states:

1. **No password** — Setup screen. Set an admin password.
2. **Password set, no manifest** — Create page. Build bundles through the web UI.
3. **Manifest exists** — Recover page. Friends enter their shares to recover.

After creating bundles, friends download their individual bundles (containing their share, README, and a personalized recover.html). The encrypted archive is also saved on the server. To create a new bundle, delete the existing one with the admin password.

## Deployment

### Reverse proxy

Put `rememory serve` behind a reverse proxy with TLS. Examples:

**Caddy:**
```
rememory.example.com {
    reverse_proxy localhost:8080
}
```

**nginx:**
```nginx
server {
    listen 443 ssl;
    server_name rememory.example.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 100M;
    }
}
```

### Authentication proxy

The admin password only protects bundle deletion. For access control, use an auth proxy:

- [Authelia](https://www.authelia.com/)
- [Cloudflare Access](https://www.cloudflare.com/products/zero-trust/access/)
- [Pocket ID](https://github.com/pocket-id/pocket-id)
- [OAuth2 Proxy](https://oauth2-proxy.github.io/oauth2-proxy/)

### Docker

A pre-built image is published to GitHub Container Registry on every release.

```bash
docker run -d \
  --name rememory \
  -p 8080:8080 \
  -v rememory-data:/data \
  ghcr.io/eljojo/rememory:latest
```

This starts the server on port 8080 with persistent data in a Docker volume. Visit `http://localhost:8080` to set up.

To pin a specific version:

```bash
docker run -d \
  --name rememory \
  -p 8080:8080 \
  -v rememory-data:/data \
  ghcr.io/eljojo/rememory:v0.0.16
```

**Docker Compose:**

```yaml
services:
  rememory:
    image: ghcr.io/eljojo/rememory:latest
    ports:
      - "8080:8080"
    volumes:
      - rememory-data:/data
    restart: unless-stopped

volumes:
  rememory-data:
```

The container runs as a single static binary with no dependencies. Data is stored in `/data` inside the container — mount a volume there to persist across restarts.

## Security considerations

- The server stores only encrypted archives (MANIFEST.age). Without enough shares, the archive is useless.
- Shares are never sent to the server. They stay in each friend's bundle.
- The admin password uses age's scrypt-based passphrase encryption. Choose a strong one.
- Put the server behind HTTPS and authentication appropriate for your threat model.
- The self-hosted web UI has the same Content Security Policy as the standalone HTML files, plus `'self'` for API requests.

## What friends receive

Each friend gets a ZIP bundle containing:
- Their share (in the README PDF and text file, as words and a QR code)
- A personalized recover.html that works offline
- The encrypted archive (if small enough to embed)

They can recover using either:
- The server's `/recover` page (the encrypted archive loads automatically from the server)
- The standalone recover.html from their bundle (works offline, no server needed)

## Data directory

The data directory (`--data`) contains:

```
rememory-data/
  admin.age               # Admin password (age-encrypted)
  bundles/
    <uuid>/
      meta.json           # Non-secret metadata
      MANIFEST.age        # Encrypted archive
```

Back up this directory to preserve your encrypted archives. The admin.age file can be recreated by setting a new password (you'd lose the ability to delete existing bundles with the old password, but the bundles themselves are unaffected).

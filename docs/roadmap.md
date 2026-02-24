# Self-Hosted Roadmap

Future ideas for the self-hosted mode. These are possibilities, not commitments.

## Ideas

- **Server-side project.yml** — Store the project configuration (friend names, threshold) on the server so it can be reloaded across sessions
- **Admin-only navigation** — Hide the create/delete UI from non-admin visitors
- **Bundles without manifest** - for online self-hosted use
- **Multi-manifest support** — Store and manage multiple manifests on one server
- **Backup/export** — Download the entire data directory as a single archive
- **OIDC/OAuth** — Built-in authentication instead of relying on auth proxies
- **PDF-only bundles** — An advanced option in the bundle creator: instead of a full ZIP with recover.html, just produce the PDF with the share. For self-hosted setups where recovery happens through the server, the ZIP and offline tool aren't needed — the PDF alone is enough to hand someone
- **Contact list on the home page** — Show each friend's contact info on the self-hosted home page, so anyone in the family can see who holds a piece and how to reach them
- **Custom branding** — Upload a logo, set a project name shown in the header

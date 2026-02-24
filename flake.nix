{
  description = "ReMemory - encrypt secrets and split access among trusted friends";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    playwright.url = "github:pietdevries94/playwright-web-flake";
    playwright.inputs.nixpkgs.follows = "nixpkgs";
    playwright.inputs.flake-utils.follows = "flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, playwright }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [
            (final: prev: {
              inherit (playwright.packages.${system}) playwright-test playwright-driver;
            })
          ];
        };

        rememory = pkgs.buildGoModule {
          pname = "rememory";
          version = "0.1.0";
          src = ./.;

          vendorHash = "sha256-b5LSrwhujjMhsIErDYY22k7ZWiGl2zSMc5HcB1mqu0c=";
          proxyVendor = true; # Download deps during build instead of vendoring

          nativeBuildInputs = [ pkgs.esbuild pkgs.gnumake pkgs.nodejs pkgs.cacert ];

          npmDeps = pkgs.fetchNpmDeps {
            src = ./.;
            hash = "sha256-LL0tewQfiTu2u+nsHN8JL5vvEKSMwvAq/8pmbhsKffo=";
          };

          # Patch go.mod to match nixpkgs Go version (nixpkgs may lag behind)
          prePatch = ''
            sed -i "s/^go .*/go ${pkgs.go.version}/" go.mod
          '';

          # Install npm deps and build TypeScript + WASM
          preBuild = ''
            export HOME=$TMPDIR
            npm config set cache "$npmDeps"
            npm ci --ignore-scripts --prefer-offline
            export PATH="$PWD/node_modules/.bin:$PATH"
            make wasm
          '';

          # Generate and install man pages
          postInstall = ''
            mkdir -p $out/share/man/man1
            $out/bin/rememory doc $out/share/man/man1
          '';

          subPackages = [ "cmd/rememory" ];

          ldflags = [ "-s" "-w" "-X main.version=${self.shortRev or "dev"}" ];
        };

      in
      {
        packages = {
          rememory = rememory;
          default = rememory;

          docker = pkgs.dockerTools.buildImage {
            name = "rememory";
            tag = "latest";
            copyToRoot = pkgs.buildEnv {
              name = "rememory-root";
              paths = [ rememory ];
            };
            config = {
              Cmd = [ "${rememory}/bin/rememory" "serve" "--host" "0.0.0.0" "--port" "8080" "--data" "/data" ];
              ExposedPorts = { "8080/tcp" = { }; };
              Volumes = { "/data" = { }; };
            };
          };

          e2e-tests = pkgs.buildNpmPackage {
            pname = "rememory-e2e";
            version = "1.0.0";
            src = ./.;

            npmDepsHash = pkgs.lib.fakeHash; # Update after first build

            nativeBuildInputs = [
              rememory
              pkgs.playwright-test
              pkgs.playwright-driver
            ];

            env = {
              PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
              PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
            };

            dontNpmBuild = true;

            buildPhase = ''
              # Remove npm-installed playwright to avoid conflicts
              rm -rf node_modules/@playwright node_modules/.bin/playwright 2>/dev/null || true
              mkdir -p node_modules/.bin
              ln -s ${pkgs.playwright-test}/bin/playwright node_modules/.bin/playwright

              # Create test fixtures
              ln -s ${rememory}/bin/rememory rememory

              echo "Running Playwright E2E tests..."
              ${pkgs.playwright-test}/bin/playwright test
            '';

            installPhase = ''
              mkdir -p $out
              if [ -d e2e/playwright-report ]; then
                cp -r e2e/playwright-report/* $out/
              fi
            '';
          };
        };

        apps = {
          rememory = flake-utils.lib.mkApp { drv = rememory; };
          default = flake-utils.lib.mkApp { drv = rememory; };
        };

        checks = {
          go-tests = rememory;
          # e2e-tests = self.packages.${system}.e2e-tests; # Enable after setup
        };

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.go
            pkgs.nodejs
            pkgs.esbuild
            pkgs.playwright-test
            pkgs.poppler-utils
          ];
          shellHook = ''
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            export PLAYWRIGHT_BROWSERS_PATH="${pkgs.playwright-driver.browsers}"
          '';
        };
      }
    );
}

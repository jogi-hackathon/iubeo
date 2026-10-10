{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  dotenv.enable = true;

  # バックエンドの設定(backend/internal/config)。開発用の値。.env で上書きできる。
  # dotenv は .env の値を lib.mkDefault(優先度 1000)で入れるので、ここの値はそれより弱い 1500 にする
  # (そのままだと、ここの値が勝って .env が効かない。https://devenv.sh/integrations/dotenv/)
  env = lib.mapAttrs (_: lib.mkOverride 1500) {
    IUBEO_ADDR = ":8080";
    IUBEO_SIGNING_KEY = "iubeo-dev-only-signing-key-do-not-use-in-prod";
    IUBEO_ALLOWED_ORIGINS = "http://localhost:5173";
    IUBEO_MATCH_SIZE = "3";
    IUBEO_PHASE_COUNT = "3";
    IUBEO_PHASE_DURATION = "30s";
    IUBEO_INTERMISSION_DURATION = "10s";
    IUBEO_BYPASS_DURATION = "30s";
    IUBEO_FIRE_DURATION = "10s";
    # 手元は 1 人でも通しを試せるように CPU で埋める(既定は 0 = 無効。0 にすれば本番と同じ挙動)。
    # 短くしたいときは .env に IUBEO_CPU_FILL_AFTER=5s のように書く
    IUBEO_CPU_FILL_AFTER = "30s";
  };

  packages = [
    pkgs.git
    pkgs.golangci-lint
    pkgs.gotools
    pkgs.air # Go ホットリロード
    pkgs.typos
    pkgs.commitizen
  ];

  languages.go = {
    enable = true;
    version = "1.27.1";
  };

  languages.javascript = {
    enable = true;
    pnpm = {
      enable = true;
      install.enable = true;
    };
    directory = "frontend";
  };

  languages.typescript.enable = true;

  processes.backend = {
    cwd = "backend";
    exec = "air";
  };
  processes.frontend = {
    cwd = "frontend";
    exec = "pnpm dev";
  };

  scripts.fmt.exec = ''
    cd "$DEVENV_ROOT"
    gofmt -w backend
    if [ -f frontend/package.json ]; then pnpm --dir frontend exec oxfmt --write .; fi
  '';

  scripts.lint.exec = ''
    cd "$DEVENV_ROOT"
    if [ -f backend/go.mod ]; then (cd backend && golangci-lint run ./...); fi
    if [ -f frontend/package.json ]; then pnpm --dir frontend exec oxlint . && pnpm --dir frontend exec oxfmt --check .; fi
  '';

  scripts.test-all.exec = ''
    cd "$DEVENV_ROOT"
    if [ -f backend/go.mod ]; then (cd backend && go test ./...); fi
    if [ -f frontend/package.json ]; then pnpm --dir frontend test --if-present; fi
  '';

  scripts.swagger.exec = ''
    cd "$DEVENV_ROOT"
    echo "Swagger UI: http://localhost:8090/docs/"
    ${pkgs.python3}/bin/python3 -m http.server 8090 --directory backend/api
  '';

  enterShell = ''
    echo "go:   $(go version)"
    echo "node: $(node --version)  pnpm: $(pnpm --version)"
  '';

  enterTest = ''
    go version
    node --version
    pnpm --version
  '';

  git-hooks.hooks = {
    check-merge-conflicts.enable = true;
    detect-private-keys.enable = true;
    end-of-file-fixer.enable = true;
    trim-trailing-whitespace.enable = true;
    typos.enable = true;
    nixfmt.enable = true;
    mdformat.enable = true;

    gofmt = {
      enable = true;
      files = "^backend/.*\\.go$";
    };
    govet = {
      enable = true;
      files = "^backend/.*\\.go$";
      pass_filenames = false;
    };
    golangci-lint = {
      enable = true;
      files = "^backend/.*\\.go$";
      pass_filenames = false;
      stages = [ "pre-push" ];
    };

    oxfmt = {
      enable = true;
      files = "^frontend/";
      settings = {
        binPath = "./frontend/node_modules/.bin/oxfmt";
        mode = "write";
      };
    };
    oxlint = {
      enable = true;
      files = "^frontend/";
      settings = {
        binPath = "./frontend/node_modules/.bin/oxlint";
        fix = [ "safe" ];
      };
    };

    commitizen.enable = true;
  };
}

{
  pkgs,
  lib,
  config,
  inputs,
  ...
}:

{
  # https://devenv.sh/basics/
  dotenv.enable = true;

  # バックエンドの設定(backend/internal/config)。開発用の値。.env で上書きできる。
  # dotenv は .env の値を lib.mkDefault(優先度 1000)で入れるので、ここの値はそれより弱い 1500 にする
  # (そのままだと、ここの値が勝って .env が効かない。https://devenv.sh/integrations/dotenv/)
  env = lib.mapAttrs (_: lib.mkOverride 1500) {
    IUBEO_ADDR = ":8080";
    # 開発専用の署名鍵。本番では必ず別の秘密の値(32 バイト以上)を渡す
    IUBEO_SIGNING_KEY = "iubeo-dev-only-signing-key-do-not-use-in-prod";
    # カンマ区切り。Vite の dev サーバー
    IUBEO_ALLOWED_ORIGINS = "http://localhost:5173";
    IUBEO_MATCH_SIZE = "3";
    # フェーズの数・長さ・フェーズの間の長さ(time.ParseDuration の形)
    IUBEO_PHASE_COUNT = "3";
    IUBEO_PHASE_DURATION = "30s";
    IUBEO_INTERMISSION_DURATION = "10s";
    # 最後のフェーズを生き残ってから、火がつかなくても勝ちにするまで / 火をつけてから勝ちにするまで
    IUBEO_BYPASS_DURATION = "30s";
    IUBEO_FIRE_DURATION = "10s";
  };

  # https://devenv.sh/packages/
  packages = [
    pkgs.git
    pkgs.golangci-lint
    pkgs.gotools
    pkgs.air # Go ホットリロード
    pkgs.typos
    pkgs.commitizen
  ];

  # https://devenv.sh/languages/
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

  # https://devenv.sh/processes/
  processes.backend = {
    cwd = "backend";
    exec = "air";
  };
  processes.frontend = {
    cwd = "frontend";
    exec = "pnpm dev";
  };

  # https://devenv.sh/scripts/
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

  # backend/api/openapi.yaml を Swagger UI で見る(http://localhost:8090/docs/)
  scripts.swagger.exec = ''
    cd "$DEVENV_ROOT"
    echo "Swagger UI: http://localhost:8090/docs/"
    ${pkgs.python3}/bin/python3 -m http.server 8090 --directory backend/api
  '';

  enterShell = ''
    echo "go:   $(go version)"
    echo "node: $(node --version)  pnpm: $(pnpm --version)"
  '';

  # https://devenv.sh/tests/
  enterTest = ''
    go version
    node --version
    pnpm --version
  '';

  # https://devenv.sh/git-hooks/
  git-hooks.hooks = {
    # 共通
    check-merge-conflicts.enable = true;
    detect-private-keys.enable = true;
    end-of-file-fixer.enable = true;
    trim-trailing-whitespace.enable = true;
    typos.enable = true;
    nixfmt.enable = true;
    mdformat.enable = true;

    # Go(backend/)
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

    # Frontend(frontend/)
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

    # Conventional Commits
    commitizen.enable = true;
  };
}

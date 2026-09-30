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
  # backend の雛形ができたら有効化する
  # processes.backend = {
  #   cwd = "backend";
  #   exec = "air";
  # };
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
    if [ -f frontend/package.json ]; then pnpm --dir frontend exec oxlint .; fi
  '';

  scripts.test-all.exec = ''
    cd "$DEVENV_ROOT"
    if [ -f backend/go.mod ]; then (cd backend && go test ./...); fi
    if [ -f frontend/package.json ]; then pnpm --dir frontend test --if-present; fi
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

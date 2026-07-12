# devenv.nix — env tier L2 テンプレ (再現性要・チーム共有・CI byte 一致で escalation)
#
# hermetic: 宣言した依存しか見えない、content-addressed store で全 project 共有 (低ストレージ)。
# 破棄: project は rm -rf .devenv、global は `nix-collect-garbage -d` 一発。
# 重要: services.* は DB/Redis を **native プロセス**で起動する。コンテナではない (state tier S1)。
#
# .envrc に `use devenv` を書けば cd で自動ロード / 離脱で自動アンロード。

{ pkgs, ... }:

{
  # ── toolchain (0a-2 の検出結果で埋める) ─────────────────────
  # languages.python.enable = true;
  # languages.javascript = { enable = true; package = pkgs.nodejs_22; };

  # ── native services (state tier S1、コンテナ無しで本物の DB) ──
  # services.postgres = {
  #   enable = true;
  #   # CI で PGlite との差分検証に使う本物 PG。データは project-local、破棄は rm -rf .devenv
  #   initialDatabases = [{ name = "app"; }];
  # };
  # services.redis.enable = true;

  packages = [ ];
}

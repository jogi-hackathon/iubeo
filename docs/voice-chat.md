# Voice Chat（VC）

セッション中のプレイヤーが、距離減衰つきで声を出し合う。実装は別ホストの VC サービス
（`vc.thirdlf03.com`）と MoQ リレー（`media.thirdlf03.com:4443`）をそのまま使い、
ゲームのバックエンドが**セッションに紐づいたトークンを発行する**ところだけを足している。

## 構成

```
browser ──GET /api/v1/voice/token──▶ ゲームの backend（EC2 / Cloudflare Containers）
   │                                   セッション参加者に EdDSA JWT を発行
   │
   ├──wss──▶ vc-elixir (vc.thirdlf03.com/v1/signaling)   roster（誰が居るか）
   └──QUIC──▶ moq-relay (media.thirdlf03.com:4443)       音声（Opus / datagram）
                 └─ POST /v1/moq/auth ──▶ vc-elixir        room の中だけ publish/subscribe を許す
```

- トークンは VC サービスと同じ Ed25519 の鍵で署名する（`IUBEO_VC_PRIVATE_KEY`。VC ホストの
  `/etc/vc/keys/private.jwk` の `d`）。`vc` 側は `docs/protocol.md` §1 のとおり検証する
- `room` は**セッション id**、`sub` は**プレイヤー id**。moq-relay は `vc-bench/<room>/<sub>` の
  publish と `vc-bench/<room>/*` の subscribe だけを許すので、別のセッションには漏れない
- 位置はゲームの `transforms`（サーバーの正）を使う。VC 層は位置を知らない（`docs/protocol.md` §5）

## ゲーム側の実装

- バックエンド: `GET /api/v1/voice/token`（`backend/internal/server/voice.go`）。
  セッションに居ない人は 403。JWT の発行は `backend/internal/voice`
- フロント: `frontend/src/voice/`
  - `store.ts` … 接続の管理（トークン取得 → signaling → MoQ）。状態は `useVoiceState`
  - `signaling.ts` … roster と ping
  - `moq.ts` … `@moq/net` で `vc-bench/<room>/<id>` の `audio` トラックを publish / subscribe。
    Opus の 1 フレームを QUIC datagram で送る
  - `audio.ts` … マイク（AudioWorklet で 20ms ずつ）と、相手ごとの `PannerNode`（距離減衰）
  - `VoiceChat.tsx` … サンドボックスのセッション中だけマウント。毎フレーム、カメラを聞き手にして、
    roster に居る人の声をその位置に置く
- 状態はゲームのスキーマ（`docs/backend/state-schema.md`）には含めない。サーバーは声を知らない

## 操作（HUD を足さない）

- **V を押している間だけ**マイクを送る（push-to-talk）。マイクは最初に押したときに取得する
- **M** でミュートを切り替える
- 状態は照準（Reticle）の細い輪だけで示す。緑=送信中、赤=ミュート、灰=待機。セッション開始直後だけ
  「V で通話 / M でミュート」を数秒出す
- PC（ゲーム内ブラウザ）を使っている間は、キーを PC に渡すため何もしない

## 環境変数（ゲームの backend）

| 変数 | 例 | 説明 |
|---|---|---|
| `IUBEO_VC_PRIVATE_KEY` | （base64url 32 バイト） | VC の JWT を署名する Ed25519 の種。VC ホストと共有。無ければ発行しない |
| `IUBEO_VC_SIGNALING_URL` | `wss://vc.thirdlf03.com/v1/signaling` | シグナリング |
| `IUBEO_VC_MEDIA_URL` | `https://media.thirdlf03.com:4443` | MoQ(WebTransport) |

EC2 では `terraform.tfvars` の `vc_private_key` / `vc_signaling_url` / `vc_media_url` から
`/etc/iubeo/env` に入る（`infra/aws/terraform/README.md`）。ただし `/etc/iubeo/env` は初回起動時にしか
作らないので、**VC を入れる前に作ったインスタンスには入っていない**（`GET /api/v1/voice/token` が
`available: false` を返す）。反映の手順は
`infra/aws/terraform/README.md` の「注意」を参照。手元は `.env` に書く（`.env` は追跡しない）。

```sh
# 手元の例
IUBEO_VC_PRIVATE_KEY=<vc ホストの private.jwk の d>
IUBEO_VC_SIGNALING_URL=wss://vc.thirdlf03.com/v1/signaling
IUBEO_VC_MEDIA_URL=https://media.thirdlf03.com:4443
```

Cloudflare Containers（`target` が `ec2` でないとき。ADR-0005）では、`cf` で入れた Worker の env を
**`worker/backend.ts` の `voiceEnv` が `container.start` の env へ載せる**。Worker の env はコンテナへ
自動で渡らないので、`cloudflare.config.ts` に足すだけでは効かない。鍵の投入は 1 回だけ:

```sh
# VC ホストの /etc/vc/keys/private.jwk の d。値は terraform.tfvars の vc_private_key と同じ
cf workers secrets update IUBEO_VC_PRIVATE_KEY --worker iubeo-backend --text <d>
```

`IUBEO_VC_SIGNALING_URL` / `IUBEO_VC_MEDIA_URL` は秘密ではないので `cloudflare.config.ts` に
`bindings.text` で直書きする。3 つとも揃っていないとサーバーは「VC 無し」になり、
`GET /api/v1/voice/token` は 200 で `available: false` を返す（設定が無いのは異常ではないので、
クライアントが毎回コンソールにエラーを出さないよう 200 にしている）。

## 対象ブラウザ

WebTransport（HTTP/3）を使うので **Chrome / Edge のみ**。Firefox・Safari では VC だけ動かない
（ゲーム本体は動く。トークンの取得は 200 で返るが、`@moq/net` の接続が失敗して `unavailable` になる）。

## 確認したこと

- 発行した JWT が、デプロイ済みの `vc-elixir` の `/v1/signaling` に通る
- `frontend/src/voice` の `Signaling` + `MoqVoice` を実ブラウザ（Chromium）で 2 クライアント動かし、
  相互に publish/subscribe できる（Opus の送受信を確認）
- リレーの E2E（`vc` の `deploy-e2e.ts`）が `vc.thirdlf03.com` で PASS
- `go test ./...` / `pnpm typecheck` / `pnpm lint`

## いまの制約・あとで直すところ

- 相手ごとの発話インジケータは無い（照準の輪だけ）。必要ならプレイヤーの頭の上に付ける
- トークンの TTL は 30 分。セッションが終わっても、発行済みトークンは期限まで有効
  （接続中の MoQ は切れない）
- マイクは最初の push-to-talk まで取得しない。セッションを抜けたら止める
- 音声の符号化は WebCodecs の Opus（モノラル 48kbps、20ms フレーム、`latencyMode: realtime`）。`MoqVoice` の `bitrate` / `frameDurationMs` / `complexity` で調整できる。`@moq/net` は 0.4.1 に固定（`vc` の bench と同じ）
- Opus の in-band FEC（`useinbandfec`）はエンコードはできるが、**WebCodecs の `AudioDecoder` に損失フレームを復元する API が無い**ので、いまは使っていない（MoQ の datagram は非信頼なので、損失対策は別途: 同一フレームの二重送信、重要な区間を group 側に載せる、など）

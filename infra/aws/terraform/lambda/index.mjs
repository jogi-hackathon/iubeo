/**
 * IUBEO のバックエンド(EC2 + EIP)を起動・停止する Lambda。
 *
 * 2 つの入口がある。
 *
 * 1. Function URL(Discord の interactions エンドポイント)
 *    - Ed25519 の署名を検証してから /start /stop を実行する
 *    - 検証には DISCORD_PUBLIC_KEY が要る
 * 2. 直接 invoke(運用・検証用)
 *    - `{"action": "start"}` / `{"action": "stop"}`
 *    - Function URL と違い IAM でしか叩けないので、署名検証は不要
 *
 * 自動停止は EventBridge Scheduler に「N 時間後の 1 回だけ」を登録して行う。
 * 忘れてつけっぱなしにすると $0.67/日 が漏れ続けるので、これが本当の目的。
 */
import {createPublicKey, verify} from "node:crypto";

const {
  INSTANCE_ID,
  AUTO_STOP_HOURS = "3",
  SCHEDULE_NAME = "iubeo-autostop",
  SCHEDULE_ROLE_ARN,
  LAMBDA_ARN,
  DISCORD_PUBLIC_KEY = "",
  DISCORD_WEBHOOK_URL = "",
  AWS_REGION = "ap-northeast-1",
} = process.env;

/** 署名の時刻がこれ以上ずれていたら拒否する(Discord の推奨) */
const MAX_SIGNATURE_AGE_SEC = 300;

/** Discord のコマンド名 → 実行する action。旧名も受け付ける */
const COMMANDS = {
  ec2start: "start",
  ec2stop: "stop",
  start: "start",
  stop: "stop",
};

/** Discord のチャンネルに投稿する。Webhook 未設定なら何もしない */
const notifyDiscord = async (content) => {
  if (!DISCORD_WEBHOOK_URL) {
    console.log("DISCORD_WEBHOOK_URL is not set; skipping:", content);
    return false;
  }
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({content}),
    });
    if (!res.ok) {
      console.error("webhook failed", res.status, await res.text());
    }
    return res.ok;
  } catch (e) {
    console.error("webhook error", e);
    return false;
  }
};

const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;
const RESPONSE_PONG = 1;
const RESPONSE_CHANNEL_MESSAGE = 4;

/**
 * Discord の公開鍵(32 バイトの hex)を Ed25519 の SPKI に包む。
 * node:crypto は Ed25519 をそのまま扱えるので、外部ライブラリは要らない。
 */
const discordPublicKey = (() => {
  if (!DISCORD_PUBLIC_KEY) {
    return null;
  }
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(DISCORD_PUBLIC_KEY, "hex"),
  ]);
  return createPublicKey({key: der, format: "der", type: "spki"});
})();

/** Discord の署名を検証する */
const verifyDiscordSignature = (headers, body) => {
  if (!discordPublicKey) {
    return false;
  }
  const signature = headers["x-signature-ed25519"];
  const timestamp = headers["x-signature-timestamp"];
  if (!signature || !timestamp || !body) {
    return false;
  }
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SEC) {
    return false;
  }
  try {
    return verify(
      null,
      Buffer.from(timestamp + body),
      discordPublicKey,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
};

const ec2 = async () => {
  const {EC2Client, StartInstancesCommand, StopInstancesCommand} = await import(
    "@aws-sdk/client-ec2"
  );
  return {client: new EC2Client({region: AWS_REGION}), StartInstancesCommand, StopInstancesCommand};
};

const scheduler = async () => {
  const {
    SchedulerClient,
    CreateScheduleCommand,
    DeleteScheduleCommand,
  } = await import("@aws-sdk/client-scheduler");
  return {client: new SchedulerClient({region: AWS_REGION}), CreateScheduleCommand, DeleteScheduleCommand};
};

const startInstance = async () => {
  const {client, StartInstancesCommand} = await ec2();
  await client.send(new StartInstancesCommand({InstanceIds: [INSTANCE_ID]}));
};

const stopInstance = async () => {
  const {client, StopInstancesCommand} = await ec2();
  await client.send(new StopInstancesCommand({InstanceIds: [INSTANCE_ID]}));
};

/** 「N 時間後に自分を stop で呼ぶ」を 1 回だけ登録する */
const scheduleAutoStop = async (hours) => {
  const {client, CreateScheduleCommand} = await scheduler();
  const at = new Date(Date.now() + Number(hours) * 3600 * 1000);
  await client.send(
    new CreateScheduleCommand({
      Name: SCHEDULE_NAME,
      // 同じ名前で作り直せるように上書きを許す
      FlexibleTimeWindow: {Mode: "OFF"},
      ScheduleExpression: `at(${at.toISOString().replace(/\.\d{3}Z$/, "")})`,
      ScheduleExpressionTimezone: "UTC",
      Target: {
        Arn: LAMBDA_ARN,
        RoleArn: SCHEDULE_ROLE_ARN,
        Input: JSON.stringify({action: "stop", reason: "auto-stop"}),
      },
      ActionAfterCompletion: "DELETE",
    }),
  );
  return at;
};

const cancelAutoStop = async () => {
  const {client, DeleteScheduleCommand} = await scheduler();
  try {
    await client.send(new DeleteScheduleCommand({Name: SCHEDULE_NAME}));
  } catch (e) {
    // 無ければそれでよい
    if (e?.name !== "ResourceNotFoundException") {
      throw e;
    }
  }
};

/** 起動・停止の本体。Discord からも直接 invoke からもここを呼ぶ */
const runAction = async (action) => {
  if (action === "start") {
    await startInstance();
    const at = await scheduleAutoStop(AUTO_STOP_HOURS);
    return `EC2 を起動しました。${AUTO_STOP_HOURS} 時間後（${at.toISOString()}）に自動で停止します。`;
  }
  if (action === "stop") {
    await stopInstance();
    await cancelAutoStop();
    // 実際に止まったら EC2 の状態変化イベントが Discord へ投稿する
    return "EC2 を停止しています…（止まったらここに投稿します）";
  }
  throw new Error(`unknown action: ${action}`);
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {"content-type": "application/json"},
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  // --- EventBridge: EC2 の状態変化 ---
  // 停止は「コマンドを実行した時点」ではなく「実際に止まった時点」で投稿したいので、
  // 状態変化イベントで受ける。CLI から止めた場合も拾える。
  if (event?.["detail-type"] === "EC2 Instance State-change Notification") {
    const state = event.detail?.state;
    const instanceId = event.detail?.["instance-id"];
    if (instanceId === INSTANCE_ID) {
      const message =
        state === "stopped"
          ? "🛑 EC2 を停止しました"
          : state === "running"
            ? "🚀 EC2 が起動しました"
            : null;
      if (message) {
        await notifyDiscord(message);
      }
    }
    return {ok: true, state, instanceId};
  }

  // --- 直接 invoke（Function URL ではない）---
  // 運用・検証用。IAM でしか叩けないので署名検証は不要
  if (!event?.requestContext?.http) {
    const action = event?.action;
    try {
      const message = await runAction(action);
      console.log("direct invoke", {action, message});
      return {ok: true, action, message};
    } catch (e) {
      console.error("direct invoke failed", e);
      return {ok: false, action, error: String(e)};
    }
  }

  // --- Function URL（Discord の interactions）---
  const headers = Object.fromEntries(
    Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const body = event.body ?? "";
  if (event.isBase64Encoded) {
    return json(400, {error: "base64 body is not supported"});
  }
  if (!verifyDiscordSignature(headers, body)) {
    console.warn("signature verification failed");
    return json(401, {error: "invalid request signature"});
  }

  let interaction;
  try {
    interaction = JSON.parse(body);
  } catch {
    return json(400, {error: "invalid json"});
  }

  // Discord のエンドポイント確認
  if (interaction.type === INTERACTION_PING) {
    return json(200, {type: RESPONSE_PONG});
  }

  if (interaction.type === INTERACTION_APPLICATION_COMMAND) {
    const name = interaction.data?.name;
    const action = COMMANDS[name];
    if (!action) {
      return json(200, {
        type: RESPONSE_CHANNEL_MESSAGE,
        data: {content: `未対応のコマンドです: ${name}`},
      });
    }
    try {
      const message = await runAction(action);
      return json(200, {type: RESPONSE_CHANNEL_MESSAGE, data: {content: message}});
    } catch (e) {
      console.error("command failed", {name, e});
      return json(200, {
        type: RESPONSE_CHANNEL_MESSAGE,
        data: {content: `失敗しました: ${String(e)}`},
      });
    }
  }

  return json(200, {
    type: RESPONSE_CHANNEL_MESSAGE,
    data: {content: "対応していない操作です。"},
  });
};

// 直接 invoke のテストで使う
export const _internal = {verifyDiscordSignature, scheduleAutoStop};

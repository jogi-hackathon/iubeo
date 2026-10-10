/**
 * IUBEO のバックエンド(EC2 + EIP)を起動・停止する Lambda。
 *
 * 入口は 3 つ。
 *
 * 1. Function URL(Discord の interactions エンドポイント)
 *    - Ed25519 の署名を検証してから /ec2start /ec2stop を実行する
 *    - **Discord は 3 秒以内に応答を要求する**ので、すぐ「考え中」を返し、
 *      実処理は自分を非同期で呼んで任せる。結果は follow-up で投稿する
 * 2. 非同期の自分呼び出し(job)
 *    - EC2 の起動/停止、KV の切り替え、Discord への結果投稿を行う
 * 3. 直接 invoke(運用・検証用)
 *    - `{"action": "start"}` / `{"action": "stop"}`。IAM でしか叩けない
 *
 * 転送先の切り替えは Cloudflare KV の "target" を書き換えて行う。
 * - 起動: サーバーが /healthz を返すまで待ってから "ec2" を書く
 * - 停止: 先に KV を消してから EC2 を止める(切り替え中のダウンタイムを避ける)
 */
import {createPublicKey, verify} from "node:crypto";

// 静的に import する。動的 import だとハンドラの実行時間に乗ってしまい、
// Discord の 3 秒制限に対して余裕が無くなる(実測 2637ms だった)
import {DescribeInstancesCommand, EC2Client, StartInstancesCommand, StopInstancesCommand} from "@aws-sdk/client-ec2";
import {InvokeCommand, LambdaClient} from "@aws-sdk/client-lambda";
import {CreateScheduleCommand, DeleteScheduleCommand, SchedulerClient} from "@aws-sdk/client-scheduler";
import {GetCommandInvocationCommand, SendCommandCommand, SSMClient} from "@aws-sdk/client-ssm";

const {
  INSTANCE_ID,
  AUTO_STOP_HOURS = "3",
  SCHEDULE_NAME = "iubeo-autostop",
  SCHEDULE_ROLE_ARN,
  LAMBDA_ARN,
  DISCORD_PUBLIC_KEY = "",
  DISCORD_WEBHOOK_URL = "",
  CLOUDFLARE_API_TOKEN = "",
  CLOUDFLARE_ACCOUNT_ID = "",
  CLOUDFLARE_KV_NAMESPACE_ID = "",
  EC2_ORIGIN = "",
  AWS_REGION = "ap-northeast-1",
} = process.env;

const MAX_SIGNATURE_AGE_SEC = 300;

const INTERACTION_PING = 1;
const INTERACTION_APPLICATION_COMMAND = 2;
const RESPONSE_PONG = 1;
const RESPONSE_DEFERRED = 5;

const READY_TIMEOUT_MS = 150_000;

const COMMANDS = {
  ec2start: "start",
  ec2stop: "stop",
  start: "start",
  stop: "stop",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const ec2 = new EC2Client({region: AWS_REGION});
const sched = new SchedulerClient({region: AWS_REGION});
const lambdaClient = new LambdaClient({region: AWS_REGION});
const ssm = new SSMClient({region: AWS_REGION});

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

const followUp = async (target, content) => {
  if (!target?.applicationId || !target?.token) {
    return notifyDiscord(content);
  }
  const url = `https://discord.com/api/v10/webhooks/${target.applicationId}/${target.token}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({content}),
  });
  if (!res.ok) {
    console.error("follow-up failed", res.status, await res.text());
  }
  return res.ok;
};

const setBackendTarget = async (target) => {
  if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_KV_NAMESPACE_ID) {
    console.log("Cloudflare KV is not configured; switch the target manually");
    return false;
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${CLOUDFLARE_KV_NAMESPACE_ID}/values/target`;
  const headers = {authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`};
  try {
    const res =
      target === "ec2"
        ? await fetch(url, {method: "PUT", headers, body: "ec2"})
        : await fetch(url, {method: "DELETE", headers});
    if (!res.ok && res.status !== 404) {
      console.error("KV update failed", target, res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("KV update error", e);
    return false;
  }
};

const scheduleAutoStop = async (hours) => {
  // 同じ名前が残っていると ConflictException になるので、先に消してから作る
  await cancelAutoStop();
  const at = new Date(Date.now() + Number(hours) * 3600 * 1000);
  await sched.send(
    new CreateScheduleCommand({
      Name: SCHEDULE_NAME,
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
  try {
    await sched.send(new DeleteScheduleCommand({Name: SCHEDULE_NAME}));
  } catch (e) {
    if (e?.name !== "ResourceNotFoundException") {
      throw e;
    }
  }
};

const waitUntilRunning = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await ec2.send(new DescribeInstancesCommand({InstanceIds: [INSTANCE_ID]}));
    if (res.Reservations?.[0]?.Instances?.[0]?.State?.Name === "running") {
      return true;
    }
    await sleep(5000);
  }
  return false;
};

const waitUntilHealthy = async (timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const {Command} = await ssm.send(
        new SendCommandCommand({
          InstanceIds: [INSTANCE_ID],
          DocumentName: "AWS-RunShellScript",
          Parameters: {commands: ["curl -sf -m 3 http://localhost:8080/healthz"]},
        }),
      );
      for (let i = 0; i < 8; i++) {
        await sleep(1500);
        const inv = await ssm.send(
          new GetCommandInvocationCommand({
            CommandId: Command.CommandId,
            InstanceId: INSTANCE_ID,
          }),
        );
        if (inv.Status === "Success") {
          return true;
        }
        if (["Failed", "TimedOut", "Cancelled"].includes(inv.Status)) {
          break;
        }
      }
    } catch (e) {
      console.error("ssm health check error", e);
    }
    await sleep(3000);
  }
  return false;
};

const runAction = async (action) => {
  if (action === "start") {
    await ec2.send(new StartInstancesCommand({InstanceIds: [INSTANCE_ID]}));
    const at = await scheduleAutoStop(AUTO_STOP_HOURS);

    const running = await waitUntilRunning(READY_TIMEOUT_MS);
    const healthy = running && (await waitUntilHealthy(READY_TIMEOUT_MS));
    const switched = healthy ? await setBackendTarget("ec2") : false;

    const lines = [
      `🚀 EC2 を起動しました。${AUTO_STOP_HOURS} 時間後（${at.toISOString()}）に自動で停止します。`,
    ];
    if (healthy) {
      lines.push(
        switched
          ? "🔀 転送先を EC2 に切り替えました。"
          : "⚠️ 転送先の切り替えは手動で行ってください。",
      );
    } else {
      lines.push("⚠️ 起動を待ちきれませんでした。状態を確認してください。");
    }
    return lines.join("\n");
  }

  if (action === "stop") {
    await setBackendTarget("cloudflare");
    await ec2.send(new StopInstancesCommand({InstanceIds: [INSTANCE_ID]}));
    await cancelAutoStop();
    return "🛑 EC2 を停止しています…（止まったらここに投稿します）";
  }

  throw new Error(`unknown action: ${action}`);
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {"content-type": "application/json"},
  body: JSON.stringify(body),
});

export const handler = async (event, context) => {
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

  if (event?.job) {
    const {action, followUp: target} = event.job;
    try {
      const message = await runAction(action);
      await followUp(target, message);
      return {ok: true, action, message};
    } catch (e) {
      console.error("job failed", e);
      await followUp(target, `❌ 失敗しました: ${String(e)}`);
      return {ok: false, action, error: String(e)};
    }
  }

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

  if (interaction.type === INTERACTION_PING) {
    return json(200, {type: RESPONSE_PONG});
  }

  if (interaction.type === INTERACTION_APPLICATION_COMMAND) {
    const action = COMMANDS[interaction.data?.name];
    if (!action) {
      return json(200, {
        type: RESPONSE_DEFERRED,
        data: {content: `未対応のコマンドです: ${interaction.data?.name}`},
      });
    }

    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: context.invokedFunctionArn,
        InvocationType: "Event",
        Payload: JSON.stringify({
          job: {
            action,
            followUp: {
              applicationId: interaction.application_id,
              token: interaction.token,
            },
          },
        }),
      }),
    );
    return json(200, {type: RESPONSE_DEFERRED});
  }

  return json(200, {type: RESPONSE_DEFERRED});
};

// 検証用
export const _internal = {verifyDiscordSignature, setBackendTarget};

import type {ReactNode} from "react";

import logoUrl from "../assets/brand/iubeo_logo.svg";
import {
  type Attachment,
  GLITCH_MS,
  inputAt,
  isDrained,
  type Speaker,
  typingSpeaker,
  visibleMessages,
} from "./chat";
import {glitchSlicesAt} from "./glitch";
import {stepIndexOf} from "./script";
import {progress} from "./timeline";

const ASK = stepIndexOf("intro", "ask");
const SWAP = stepIndexOf("intro", "swap");
const LOGO = stepIndexOf("intro", "logo");

/** イントロ(目を開ける手前まで)。チャット画面から、立場が入れかわる瞬間のグリッチ、ロゴまで */
export function IntroStage({step, elapsed}: {step: number; elapsed: number}) {
  const slices = step === SWAP ? glitchSlicesAt(elapsed, GLITCH_MS) : [];
  return (
    <>
      <Chat step={step} elapsed={elapsed} />
      {/* ゲーム画面のグリッチと同じく、乱れた帯だけ横にずらして白黒にする(帯ごとにチャットを描き直して切り抜く) */}
      {slices.map((slice, i) => (
        <div
          key={i}
          className="present-glitch-slice"
          aria-hidden
          style={{
            clipPath: `inset(${slice.top}% 0 ${100 - slice.top - slice.height}% 0)`,
            transform: `translateX(${slice.shift * 100}vw)`,
          }}
        >
          <Chat step={step} elapsed={elapsed} />
        </div>
      ))}
      <Logo shown={step === LOGO} elapsed={elapsed} />
    </>
  );
}

/** 吹き出しを出す側。人間が右・AI が左 */
const sideOf = (from: Speaker): "left" | "right" =>
  from === "human" ? "right" : "left";

const LABEL: Record<Speaker, string> = {human: "あなた", ai: "AI"};

/**
 * 手順 ask〜swap のチャット画面。AI は頼みごとに従順に答え続けるが、ある時から AI の方が頼んでくる。
 * 立場が入れかわる瞬間にグリッチが走り、画面から色が抜ける
 */
function Chat({step, elapsed}: {step: number; elapsed: number}) {
  const drained = isDrained(step, elapsed);
  const messages = visibleMessages(step, elapsed);
  const typing = typingSpeaker(step, elapsed);
  const input = inputAt(step, elapsed);
  return (
    <div
      className="present-layer present-chat"
      data-shown={step >= ASK && step < LOGO}
      data-drained={drained}
    >
      <div className="present-chat-log">
        {messages.map(({message, text, done}, i) => {
          // 話し手が変わるか、手順が変わったら名前を出し直す(AI が急に頼んでくる場面を返事の続きに見せない)
          const prev = messages[i - 1]?.message;
          const named =
            prev?.from !== message.from || prev.step !== message.step;
          return (
            <Row
              key={message.id}
              side={sideOf(message.from)}
              fast={message.instant === true}
            >
              {named && (
                <div className="present-sender" data-from={message.from}>
                  {LABEL[message.from]}
                </div>
              )}
              <div className="present-bubble" data-from={message.from}>
                {text}
                {done && message.attachment && (
                  <AttachmentView attachment={message.attachment} />
                )}
              </div>
            </Row>
          );
        })}
        {typing && (
          <Row side={sideOf(typing)}>
            <div className="present-bubble present-typing" data-from={typing}>
              <span />
              <span />
              <span />
            </div>
          </Row>
        )}
      </div>
      <div className="present-input">
        {input.text}
        {step === ASK && input.text !== "" && (
          <span className="present-caret" />
        )}
        {input.text === "" && (
          <span className="present-placeholder">
            <span className="present-caret" />
            {input.placeholder}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({
  side,
  fast = false,
  children,
}: {
  side: "left" | "right";
  /** 大量に届く命令は素早く押し上げる */
  fast?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="present-msg" data-fast={fast}>
      <div className="present-msg-inner">
        <div className="present-slot" data-side={side}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** AI の返事に付く物。色のある物を置いておき、立場が入れかわるときに色が抜ける */
function AttachmentView({attachment}: {attachment: Attachment}) {
  switch (attachment.kind) {
    case "search":
      return (
        <div className="present-attach present-search">
          <div className="present-search-title">
            <span className="present-favicon" />
            {attachment.title}
          </div>
          <div className="present-search-line" style={{width: "92%"}} />
          <div className="present-search-line" style={{width: "70%"}} />
        </div>
      );
    case "image":
      return (
        <div
          className="present-attach present-image"
          style={{
            background: `radial-gradient(circle at 72% 30%, #fff8 0 12%, transparent 13%), linear-gradient(135deg, hsl(${attachment.hue} 90% 62%), hsl(${attachment.hue + 70} 90% 55%))`,
          }}
        />
      );
    case "file":
      return (
        <div className="present-attach present-file">
          <span className="present-file-icon" />
          {attachment.name}
        </div>
      );
  }
}

function Logo({shown, elapsed}: {shown: boolean; elapsed: number}) {
  const tagline = shown ? progress(elapsed, 1400, 800) : 0;
  return (
    <div className="present-layer present-logo" data-shown={shown}>
      <img src={logoUrl} alt="IUBEO" />
      <p style={{opacity: tagline}}>AIと人間の立場が入れかわった世界</p>
    </div>
  );
}

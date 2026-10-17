import {
  memo,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import logoUrl from "../assets/brand/iubeo_logo.svg";
import {
  type Attachment,
  type ChatMessage,
  GLITCH_MS,
  inputAt,
  bubbleKindOf,
  isBlackedOut,
  rushGlitchAt,
  isDrained,
  isSwapped,
  revealAt,
  sideOf,
  spinnerFrame,
  type Speaker,
  type VisibleMessage,
  type VisibleToolCall,
  typingSpeaker,
  visibleMessages,
} from "./chat";
import {
  glitchPulseAt,
  revealClipPath,
  shiftedBlocksAt,
  shiftStepAt,
} from "./glitch";
import {stepIndexOf} from "./script";
import {SkyBackdrop} from "./SkyBackdrop";
import {isSkyActive} from "./skyView";
import {logoFadeOutAt} from "./timeline";
import {MOTION_BLUR_ID, useMotionBlur} from "./useMotionBlur";

const ASK = stepIndexOf("intro", "ask");
const SWAP = stepIndexOf("intro", "swap");
const LOGO = stepIndexOf("intro", "logo");
const LOGO_OUT = stepIndexOf("intro", "logo-out");

const DECOR_MESSAGES = 40;

interface ChatView {
  step: number;
  elapsed: number;
  shown: boolean;
  drained: boolean;
  swapped: boolean;
  messages: VisibleMessage[];
  typing: Speaker | null;
  input: ReturnType<typeof inputAt>;
}

const chatViewAt = (step: number, elapsed: number): ChatView => ({
  step,
  elapsed,
  shown: step >= ASK && step < LOGO,
  drained: isDrained(step, elapsed),
  swapped: isSwapped(step, elapsed),
  messages: visibleMessages(step, elapsed),
  typing: typingSpeaker(step, elapsed),
  input: inputAt(step, elapsed),
});

export function IntroStage({step, elapsed}: {step: number; elapsed: number}) {
  const view = chatViewAt(step, elapsed);
  const [skyFailed, setSkyFailed] = useState(false);
  const onSkyFailed = useCallback(() => setSkyFailed(true), []);
  const strength =
    step === SWAP
      ? Math.max(glitchPulseAt(elapsed, GLITCH_MS), rushGlitchAt(step, elapsed))
      : 0;
  const shiftStep = shiftStepAt(elapsed);
  const active = strength > 0;
  const latest = useRef({view, strength});
  latest.current = {view, strength};
  const decor = useMemo(
    () => ({
      blocks: active
        ? shiftedBlocksAt(
            shiftStep,
            latest.current.strength,
            window.innerWidth,
            window.innerHeight,
          )
        : [],
      view: {
        ...latest.current.view,
        messages: latest.current.view.messages.slice(-DECOR_MESSAGES),
      },
    }),
    [shiftStep, active],
  );
  const blackedOut = isBlackedOut(step, elapsed);
  const inverted = step === SWAP && view.swapped;
  const reveal = revealAt(step, elapsed);
  const skyActive = isSkyActive(inverted, blackedOut);
  const clipPath =
    reveal === null
      ? undefined
      : revealClipPath(reveal, window.innerWidth, window.innerHeight);
  return (
    <>
      {!blackedOut && reveal !== null && (
        <DecorChat view={{...view, drained: false, swapped: false}} decor />
      )}
      <div
        className="present-layer"
        style={{
          clipPath,
          visibility: inverted && !blackedOut ? undefined : "hidden",
        }}
      >
        {inverted && <div className="present-layer present-inverted-bg" />}
        {!skyFailed && (
          <div className="present-layer present-sky">
            <SkyBackdrop active={skyActive} onFailed={onSkyFailed} />
          </div>
        )}
      </div>
      {!blackedOut && (
        <div className="present-layer" style={{clipPath}}>
          <Chat view={view} />
        </div>
      )}
      {!blackedOut &&
        decor.blocks.map((block) => (
          <div
            key={`${block.x}:${block.y}`}
            className="present-glitch-block"
            data-inverted={inverted}
            aria-hidden
            style={{
              clipPath: `inset(${block.y}px calc(100% - ${block.x + block.width}px) calc(100% - ${block.y + block.height}px) ${block.x}px)`,
              transform: `translateX(${block.shift}px)`,
            }}
          >
            <DecorChat view={decor.view} decor />
          </div>
        ))}
      <Logo
        shown={!blackedOut && (step === LOGO || step === LOGO_OUT)}
        opacity={step === LOGO_OUT ? logoFadeOutAt(elapsed) : 1}
      />
    </>
  );
}

const LABEL: Record<ChatMessage["from"], string> = {
  human: "あなた",
  ai: "AI",
};

/**
 * 手順 ask〜swap のチャット画面。AI は Tool Call を実行して頼みごとに従順に答え続けるが、ある時から AI の方が頼んでくる。
 * 立場が入れかわる瞬間にグリッチが走り、画面から色が抜けて、頼む側の青いボックスが人間から AI に移る
 */
function Chat({view, decor = false}: {view: ChatView; decor?: boolean}) {
  const {step, elapsed, shown, drained, swapped, messages, typing, input} =
    view;
  const {logRef, trackRef, blurRef} = useMotionBlur(!decor && shown && swapped);
  const lastMessage = messages[messages.length - 1]?.message;
  return (
    <div
      className="present-layer present-chat"
      data-shown={shown}
      data-drained={drained}
      data-decor={decor}
    >
      {!decor && (
        <svg className="present-filters" width="0" height="0" aria-hidden>
          <filter
            id={MOTION_BLUR_ID}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur ref={blurRef} stdDeviation="0 0" />
          </filter>
        </svg>
      )}
      <div className="present-chat-log" ref={decor ? undefined : logRef}>
        <div className="present-chat-track" ref={decor ? undefined : trackRef}>
          {messages.map(({message, text, done, tools}, i) => {
            const prev = messages[i - 1]?.message;
            const kind = bubbleKindOf(message, swapped);
            return (
              <Row
                key={message.id}
                side={sideOf(message.from)}
                fast={message.instant === true}
                blur={message.step >= SWAP}
              >
                {isNamed(prev, message) && (
                  <div className="present-sender" data-from={message.from}>
                    {LABEL[message.from]}
                  </div>
                )}
                {kind !== "agent" ? (
                  <div className="present-bubble" data-kind={kind}>
                    {text}
                    {done && message.attachment && (
                      <AttachmentView attachment={message.attachment} />
                    )}
                  </div>
                ) : (
                  <div className="present-agent">
                    {tools.map((tool) => (
                      <ToolCallLine key={tool.call.startAt} tool={tool} />
                    ))}
                    {text !== "" && (
                      <div className="present-agent-text">{text}</div>
                    )}
                    {done && message.attachment && (
                      <AttachmentView attachment={message.attachment} />
                    )}
                  </div>
                )}
              </Row>
            );
          })}
          {typing && (
            <Row side={sideOf(typing)}>
              {isNamed(lastMessage, {from: typing, step}) && (
                <div className="present-sender" data-from={typing}>
                  {LABEL[typing]}
                </div>
              )}
              <div className="present-thinking">
                {spinnerFrame(elapsed)} 考え中
              </div>
            </Row>
          )}
        </div>
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

const DecorChat = memo(Chat);

const isNamed = (
  prev: Pick<ChatMessage, "from" | "step"> | undefined,
  message: Pick<ChatMessage, "from" | "step">,
): boolean => prev?.from !== message.from || prev.step !== message.step;

function ToolCallLine({tool}: {tool: VisibleToolCall}) {
  return (
    <div className="present-tool" data-done={tool.done}>
      {tool.status}
    </div>
  );
}

function Row({
  side,
  fast = false,
  blur = false,
  children,
}: {
  side: "left" | "right";
  blur?: boolean;
  /** 大量に届く命令は素早く押し上げる */
  fast?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="present-msg" data-fast={fast} data-blur={blur}>
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

function Logo({shown, opacity}: {shown: boolean; opacity: number}) {
  return (
    <div className="present-layer" style={{opacity, transition: "none"}}>
      <div className="present-layer present-logo" data-shown={shown}>
        <img src={logoUrl} alt="IUBEO" />
      </div>
    </div>
  );
}

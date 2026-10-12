import {Vector3} from "three";
import {describe, expect, it} from "vitest";

import {CAMERA_FOV} from "../../../../camera/constants";
import {CAPSULE_RADIUS, EYE_FORWARD} from "../../../../player/constants";
import {
  ROOM_INNER_X,
  WALL_THICKNESS,
  WINDOW_CENTER_Z,
  WINDOW_SILL_HEIGHT,
  WINDOW_SIZE,
} from "../../layout";
import {CREDIT_LINES} from "../content";
import {
  BOARD_X,
  boardCenterY,
  layoutCredits,
  rollSeconds,
  VIEW_POSITION,
  VIEW_YAW,
} from "../roll";
import {gazesAtWindow} from "../trigger";

const centerY = WINDOW_SILL_HEIGHT + WINDOW_SIZE / 2;

describe("layoutCredits", () => {
  it("行を隙間なく上から積み、板の高さは行の高さの合計", () => {
    const {rows, height} = layoutCredits(CREDIT_LINES);
    expect(rows[0]!.top).toBe(0);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.top).toBeCloseTo(rows[i - 1]!.top + rows[i - 1]!.height);
    }
    const last = rows[rows.length - 1]!;
    expect(height).toBeCloseTo(last.top + last.height);
  });

  it("最初の行はロゴ", () => {
    expect(CREDIT_LINES[0]).toEqual({type: "logo"});
  });
});

describe("boardCenterY", () => {
  const layout = layoutCredits(CREDIT_LINES);
  const rowCenterY = (row: (typeof layout.rows)[number], elapsed: number) =>
    boardCenterY(layout, elapsed) +
    layout.height / 2 -
    row.top -
    row.height / 2;

  it("見せ始めはロゴがカメラの高さ(画面の真ん中)にある", () => {
    expect(rowCenterY(layout.rows[0]!, 0)).toBeCloseTo(centerY);
  });

  it("流し終わりには、最後の行の下端まで画面の上の外に出ている", () => {
    const view = new Vector3(...VIEW_POSITION);
    const half =
      (view.x - BOARD_X) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
    const last = layout.rows[layout.rows.length - 1]!;
    const lastBottom =
      boardCenterY(layout, rollSeconds(layout)) +
      layout.height / 2 -
      last.top -
      last.height;
    expect(lastBottom).toBeGreaterThan(view.y + half);
  });

  it("ロゴを止めている間はロゴだけが画面に映り、動き出すとすぐ次の行が下から入ってくる", () => {
    const view = new Vector3(...VIEW_POSITION);
    const half =
      (view.x - BOARD_X) * Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180);
    const next = layout.rows.find(
      (r) => r.line.type !== "logo" && r.line.type !== "opening",
    )!;
    const nextTop = (elapsed: number) =>
      boardCenterY(layout, elapsed) + layout.height / 2 - next.top;
    expect(nextTop(0)).toBeLessThan(view.y - half);
    expect(nextTop(2)).toBeLessThan(view.y - half);
    expect(nextTop(3.5)).toBeGreaterThan(view.y - half);
  });

  it("下から上へ流れ続ける(途中で止まらない)", () => {
    const end = rollSeconds(layout);
    expect(boardCenterY(layout, end / 2)).toBeGreaterThan(
      boardCenterY(layout, 0),
    );
    expect(boardCenterY(layout, end)).toBeGreaterThan(
      boardCenterY(layout, end - 1),
    );
  });
});

describe("VIEW_POSITION", () => {
  it("壁の外に出て、窓の中心の高さ・横位置から外を見る(窓枠が映らない)", () => {
    expect(VIEW_POSITION[0]).toBeLessThan(-ROOM_INNER_X - WALL_THICKNESS);
    expect(VIEW_POSITION[1]).toBeCloseTo(centerY);
    expect(VIEW_POSITION[2]).toBeCloseTo(WINDOW_CENTER_Z);
    expect(VIEW_YAW).toBeCloseTo(Math.PI / 2);
  });

  it("窓の前の範囲のどこから寄っても、まっすぐ窓をくぐる(壁を抜けない)", () => {
    // 目は足もとより EYE_FORWARD だけ前に出るので、範囲をその分だけ広げて確かめる
    const view = new Vector3(...VIEW_POSITION);
    for (const dx of [CAPSULE_RADIUS, 1.5 + EYE_FORWARD]) {
      for (const dz of [-1.2 - EYE_FORWARD, 0, 1.2 + EYE_FORWARD]) {
        const eye = new Vector3(-ROOM_INNER_X + dx, 1.6, WINDOW_CENTER_Z + dz);
        expect(gazesAtWindow(eye, view.clone().sub(eye))).toBe(true);
      }
    }
  });
});

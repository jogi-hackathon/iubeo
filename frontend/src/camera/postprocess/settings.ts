import {useSyncExternalStore} from "react";

export type ToneMappingKind = "aces" | "agx" | "neutral" | "reinhard" | "none";

export const TONE_MAPPING_KINDS: readonly ToneMappingKind[] = [
  "aces",
  "agx",
  "neutral",
  "reinhard",
  "none",
];

export interface PostProcessSettings {
  /** false ならポストプロセス全体を止め、R3F の自動レンダーに戻る */
  enabled: boolean;
  /** 出力変換の前に掛ける露出(リニア倍率) */
  exposure: number;
  /** 出力変換のトーンマップ */
  toneMapping: ToneMappingKind;
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    /** 輝度(リニア)がこれを超える部分だけが光る */
    threshold: number;
  };
  pixelate: {
    enabled: boolean;
    /** ブロック1辺(ドローイングバッファの px) */
    pixelSize: number;
  };
  vignette: {
    enabled: boolean;
    /** 画面端の暗さ(0〜1) */
    intensity: number;
    smoothness: number;
  };
  /**
   * GTAO によるリアルタイム AO。間接光(ambient など)だけを減衰させる。
   * ベイク AO(bakedAO)との分担は prop ごとの AO モード(src/bake/aoMode.ts)で決まる
   */
  ao: {
    enabled: boolean;
    /** GTAO とベイク AO を合成した後の AO だけを白黒で表示する(調整用。GTAO が off でも使える) */
    showOnly: boolean;
    /** GTAO のノイズを深度・法線を見ながらぼかす(AO と同じ解像度のパスが1枚増える) */
    denoise: boolean;
    /** 遮蔽を探す半径(ワールド単位) */
    radius: number;
    /** AO の強さ */
    scale: number;
    /** 遮蔽物の厚みの想定。大きいほど細い物の裏側まで暗くなる */
    thickness: number;
    samples: number;
    /** AO を計算する解像度(ドローイングバッファ比) */
    resolutionScale: number;
  };
  /** 事前ベイクした AO(src/bake/BakedAO.tsx が静的 mesh の aoMap に貼る) */
  bakedAO: {
    /**
     * false で aoMap を外す。AO モード baked の面も GTAO に戻るので見比べられる
     * (切り替えるたびに対象マテリアルが再コンパイルされる)
     */
    enabled: boolean;
    /** aoMapIntensity(uniform なので再コンパイルは起きない) */
    intensity: number;
  };
}

/**
 * 白い世界の背景・地面はリニア輝度が 1.0 以下(背景 #fff = 1.0、照らされた面は 0.5〜0.9 程度)なので、
 * bloom の threshold を 1.0 にして「世界全体が光る」のを避け、1.0 を超える発光・ハイライトだけを光らせる。
 * strength / radius は控えめ(効果が主張しすぎない値)。
 * vignette も控えめ(白い世界で端が沈みすぎない)。
 * トーンマップは Neutral(Reinhard + 1.5 だと背景 1.0 が 0.6 = sRGB 203 まで落ちて灰色に見えたため)。
 * exposure 1.2 は Neutral の式からの初期値: 背景 1.0 → sRGB 245(ほぼ白)、面 0.5〜0.9 → 197〜242。
 * 1.5 だと背景 248 になるが面 0.8 と 0.9 の差が 2 段まで潰れる。最終値は実機で調整する
 */
export const DEFAULT_POSTPROCESS_SETTINGS: PostProcessSettings = {
  enabled: true,
  exposure: 1.2,
  toneMapping: "neutral",
  bloom: {enabled: true, strength: 0.5, radius: 0.4, threshold: 1},
  pixelate: {enabled: false, pixelSize: 4},
  vignette: {enabled: true, intensity: 0.25, smoothness: 0.6},
  ao: {
    enabled: true,
    showOnly: false,
    denoise: true,
    radius: 0.5,
    scale: 1,
    thickness: 1,
    samples: 16,
    resolutionScale: 0.5,
  },
  bakedAO: {enabled: true, intensity: 1},
};

/** vignette の smoothness の下限。0 だと smoothstep の edge0 == edge1 になる */
export const VIGNETTE_MIN_SMOOTHNESS = 0.01;

/** グループ(bloom など)は一部の項目だけを渡せる */
export type PostProcessPatch = {
  [K in keyof PostProcessSettings]?: PostProcessSettings[K] extends object
    ? Partial<PostProcessSettings[K]>
    : PostProcessSettings[K];
};

let settings: PostProcessSettings = DEFAULT_POSTPROCESS_SETTINGS;
const listeners = new Set<() => void>();

export const getPostProcessSettings = (): PostProcessSettings => settings;

const isGroup = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/** 変更があったときだけ新しいオブジェクトに差し替えて購読者へ通知する(useSyncExternalStore の参照安定性のため) */
export const updatePostProcessSettings = (patch: PostProcessPatch): void => {
  const next: Record<string, unknown> = {...settings};
  let changed = false;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const current = next[key];
    if (isGroup(current) && isGroup(value)) {
      const merged: Record<string, unknown> = {...current, ...value};
      if (Object.keys(merged).some((k) => merged[k] !== current[k])) {
        next[key] = merged;
        changed = true;
      }
    } else if (value !== undefined && current !== value) {
      next[key] = value;
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  settings = next as unknown as PostProcessSettings;
  for (const l of listeners) {
    l();
  }
};

export const resetPostProcessSettings = (): void => {
  if (settings === DEFAULT_POSTPROCESS_SETTINGS) {
    return;
  }
  settings = DEFAULT_POSTPROCESS_SETTINGS;
  for (const l of listeners) {
    l();
  }
};

export const subscribePostProcessSettings = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePostProcessSettings = (): PostProcessSettings =>
  useSyncExternalStore(subscribePostProcessSettings, getPostProcessSettings);

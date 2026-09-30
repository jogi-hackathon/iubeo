/**
 * material.userData のこのキーが true のマテリアルには GTAO を掛けず、マテリアル自身の AO(ベイク AO の aoMap)だけを使う。
 * 変えたら material.needsUpdate = true にする(GTAO の合成はマテリアルのコンパイル時に決まる)
 */
export const SKIP_GTAO = "skipGTAO";

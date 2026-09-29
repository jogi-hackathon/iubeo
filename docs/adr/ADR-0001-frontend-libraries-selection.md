# ADR-0001: フロントエンドのライブラリ選定

- 日付: 2026-09-29
- ステータス: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- 関連: \<関連する ADR / Issue / PR へのリンク>

## 背景

> どのような状況・制約・力関係のもとでこの決定が必要になったのか。

- 背景: **Webアプリケーション上で3Dを扱い、ゲームチックでかつ高品質で柔軟性の高いグラフィックを扱いたかった**

## 決定

**React + React Three Fiber + Three.js** を採用する。

採用フレームワーク・ライブラリ

- React
  https://ja.react.dev/
  - @react-three/fiber
    https://github.com/pmndrs/react-three-fiber
  - @react-three/drei
    https://github.com/pmndrs/drei
- Three.js
  https://github.com/mrdoob/three.js/
- three-mesh-bvh
  https://github.com/gkjohnson/three-mesh-bvh

理由:

- React : コンポーネントベースのモダンなアーキテクチャを採用し、後述するReact Three Fiberとの連携を求めたため
  - @react-three/fiber : Three.jsよりも”サーバー側”と”3Dオブジェクト”を紐づけやすく、コンポーネントベースでシーンを扱いたかったため
  - @react-three/drei : @react-three/fiberをより機能的に使うために必要
- Three.js : WebGL / WebGPUを扱う3Dライブラリでは最も成熟しているから、また、AIエージェントとの相性も良く、開発をより潤滑に行えると判断したため
- three-mesh-bvh : ゲームとして成立させるためのパーツかつパフォーマンス最適化のため。Player Movement, Frustum Culling等、これらを満たす機能があった

また、これらに共通して言えるのは「ライブラリ間の連携」が密接であること。
本アーキテクチャを採用することで、3Dアプリケーションとしての総合的な質が高くなると考えた。

## 検討した選択肢

### 案B: Babylon.jsストレート採用案

- 概要: 3DライブラリのコアにBabylon.jsを採用する
- 利点: ゲーム系の機能がデフォルトで充実している、外部ライブラリ導入が無くても綺麗になる。ほぼゲームエンジン。
- 欠点 / リスク:
  - Three.jsと比較するとインターネット上の情報量が少ない
  - バンドルサイズが大きい
  - 逆に機能が多すぎる (今回だと不要なレベル)
  - AIエージェントでの実装時、LLMの学習量の関係か、Three.jsよりも体感できるレベルで品質が低下した
- 却下理由: 今回の要件には過剰なレベルであること、情報量が多いThree.jsの方が開発工程での詰まりを減らせると判断したため

### 案C: Three.js + TresJS

- 概要: Vue.js上でThree.jsのシーンを構築する
- 利点: Vue.jsのエコシステム上でThree.jsをコンポーネントベースで扱える
- 欠点 / リスク :
  - React Three Fiberと比較するとインターネット上の情報量が少ない
- 却下理由: 最終的に採用した案のエコシステムが強力であり、Three.js + TresJSの構成で採用案レベルの開発体験を実現できるか不安があったため

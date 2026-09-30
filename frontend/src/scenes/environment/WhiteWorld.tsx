/**
 * IUBEO の白い世界の共通環境(背景・フォグ・ライト)。ジオメトリは含まない。
 * 影は描かず、立体感は AO で出す。AO は間接光(半球光)だけを減衰させるので、半球光を主にして平行光は弱く足す
 */
export function WhiteWorld() {
  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <fog attach="fog" args={["#ffffff", 15, 90]} />
      <hemisphereLight args={["#ffffff", "#d8d8d8", 2.2]} />
      <directionalLight position={[8, 20, 6]} intensity={0.7} />
    </>
  );
}

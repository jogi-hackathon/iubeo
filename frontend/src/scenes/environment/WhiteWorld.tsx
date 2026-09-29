/** IUBEO の白い世界の共通環境(背景・フォグ・ライト)。ジオメトリは含まない */
export function WhiteWorld() {
  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <fog attach="fog" args={["#ffffff", 15, 90]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[8, 20, 6]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
    </>
  );
}

import {Group, type Object3D} from "three";

export type SwatchFactory = () => Object3D;

export const SWATCH_BOOK_Y = -1000;

const factories = new Map<string, SwatchFactory>();
let book: Group | null = null;

const prepare = (name: string, object: Object3D): Object3D => {
  object.name = `shader-swatch:${name}`;
  object.traverse((o) => {
    o.frustumCulled = false;
    o.raycast = () => {};
  });
  return object;
};

// 見本は dispose しない。three は dispose でパイプラインの参照数を減らし、0 になったら捨てるので、
// 見本が持ち続けることで、実物がアンマウントされても次に現れるときの再コンパイルを避ける
const replaceIn = (group: Group, name: string, create: SwatchFactory): void => {
  const old = group.getObjectByName(`shader-swatch:${name}`);
  if (old) {
    group.remove(old);
  }
  group.add(prepare(name, create()));
};

export const registerShaderSwatch = (
  name: string,
  create: SwatchFactory,
): void => {
  factories.set(name, create);
  if (book) {
    replaceIn(book, name, create);
  }
};

export const getShaderSwatchBook = (): Group => {
  if (!book) {
    book = new Group();
    book.name = "shader-swatch-book";
    book.position.y = SWATCH_BOOK_Y;
    for (const [name, create] of factories) {
      replaceIn(book, name, create);
    }
  }
  return book;
};

export const shaderSwatchNames = (): string[] => Array.from(factories.keys());

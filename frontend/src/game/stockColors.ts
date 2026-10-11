import type {JsonValue} from "../core/json";
import {parseDirectoryData} from "../objects/directory/data";

export const DIRECTORY_ID = "directory-1";

export type StockColorSource = {id: string; data: JsonValue};

export const stockColorsOf = (
  objects: readonly StockColorSource[],
): Map<string, string> => {
  const colors = new Map<string, string>();
  const directory = objects.find((object) => object.id === DIRECTORY_ID);
  if (!directory) {
    return colors;
  }
  for (const file of parseDirectoryData(directory.data).stock) {
    colors.set(file.id, file.color);
  }
  return colors;
};

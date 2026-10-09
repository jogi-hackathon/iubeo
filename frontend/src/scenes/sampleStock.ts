import type {StockFile} from "../objects/directory/data";

/**
 * 在庫の見本(はっきり見分けられる 6 色)。ディレクトリの初期の中身。
 * 実際の在庫は、ゲームの進行(サーバー)が決めるまでの仮の値。room と test が使う
 */
export const SAMPLE_DIRECTORY_STOCK: readonly StockFile[] = [
  {
    id: "3f0c6a52-8d1e-4b7a-9c35-1a2e4f6b8d01",
    color: "#e63946",
    status: "unedited",
  },
  {
    id: "7b19d4e3-2c58-4a06-8f71-5d3a9c0e2b02",
    color: "#f4a261",
    status: "unedited",
  },
  {
    id: "c2e85f10-6a47-4d93-b1e8-0f7d3a5c9e03",
    color: "#ffd60a",
    status: "unedited",
  },
  {
    id: "91a4b7d6-0e3f-4c28-a5b9-6e1d8f2c4a04",
    color: "#2a9d5c",
    status: "unedited",
  },
  {
    id: "5d8e2c93-b7a1-4f60-83d4-9a0c6e1f7b05",
    color: "#1d6fe0",
    status: "unedited",
  },
  {
    id: "e07a1b48-3d95-4c2e-9f86-2b5d7a0c8e06",
    color: "#9b5de5",
    status: "unedited",
  },
];

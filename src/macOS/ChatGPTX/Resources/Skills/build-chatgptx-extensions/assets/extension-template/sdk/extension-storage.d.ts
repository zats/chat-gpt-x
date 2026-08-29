interface ExtensionStorage {
  listFiles(): Promise<readonly string[]>;
  readTextFile(path: string): Promise<string | undefined>;
  writeTextFile(path: string, contents: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

declare function createExtensionStorage(extensionId: string): ExtensionStorage;

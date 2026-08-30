type DirectoryInput = Pick<HTMLInputElement, "setAttribute"> & { webkitdirectory?: boolean; directory?: boolean };
type FileEntry = { kind: "file"; name: string; getFile(): Promise<File> };
type DirectoryEntry = { kind: "directory"; name: string; values(): AsyncIterable<FileEntry | DirectoryEntry> };
type DirectoryPickerWindow = Window & { showDirectoryPicker?: () => Promise<DirectoryEntry> };

export function configureDirectoryPicker(input: DirectoryInput): void {
  input.setAttribute("webkitdirectory", "");
  input.setAttribute("directory", "");
  input.webkitdirectory = true;
  input.directory = true;
}

export async function pickProjectDirectory(): Promise<File[]> {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) return [];
  const directory = await picker.call(window);
  return collectDirectoryFiles(directory, directory.name);
}

export async function collectDirectoryFiles(directory: DirectoryEntry, prefix: string): Promise<File[]> {
  const files: File[] = [];
  for await (const entry of directory.values()) {
    const path = `${prefix}/${entry.name}`;
    if (entry.kind === "file") {
      const file = await entry.getFile();
      Object.defineProperty(file, "webkitRelativePath", { value: path });
      files.push(file);
    } else {
      files.push(...await collectDirectoryFiles(entry, path));
    }
  }
  return files;
}

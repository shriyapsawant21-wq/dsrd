type DirectoryInput = Pick<HTMLInputElement, "setAttribute"> & { webkitdirectory?: boolean; directory?: boolean };

export function configureDirectoryPicker(input: DirectoryInput): void {
  input.setAttribute("webkitdirectory", "");
  input.setAttribute("directory", "");
  input.webkitdirectory = true;
  input.directory = true;
}

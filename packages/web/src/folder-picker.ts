export function configureDirectoryPicker(input: Pick<HTMLInputElement, "setAttribute">): void {
  input.setAttribute("webkitdirectory", "");
  input.setAttribute("directory", "");
}

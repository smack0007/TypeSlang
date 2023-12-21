export function mapModuleName(moduleName: string): string {
  if (moduleName === "") {
    return moduleName;
  }

  if (moduleName.endsWith(".ts")) {
    moduleName = moduleName.substring(0, moduleName.length - 3);
  }

  moduleName = moduleName.replaceAll("../", "pd_").replaceAll("./", "cd_");

  return `_${moduleName}_`;
}

export function packageFilter(pkg: any) {
  if (pkg.module) {
    pkg.main = pkg.module;
  }

  return pkg;
}

import { register } from 'tsconfig-paths';
import * as tsConfig from '../../tsconfig.base.json'; // eslint-disable-line @nx/enforce-module-boundaries
import { CompilerOptions } from 'typescript';

const compilerOptions = tsConfig.compilerOptions as unknown as CompilerOptions; // This is to avoid any problems with the typing system

if (compilerOptions.paths) {
  const newPaths: Record<string, string[]> = Object.entries(
    compilerOptions.paths
  ).reduce((newPathsObj, [pathKey, oldPaths]: [string, string[]]) => {
    newPathsObj[pathKey] = oldPaths.map((path) => path.replace(/.ts$/, '.js'));
    return newPathsObj;
  }, {} as Record<string, string[]>);

  register({
    baseUrl: 'dist',
    paths: newPaths,
  });
}

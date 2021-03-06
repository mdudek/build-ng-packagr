
import { Architect } from '@angular-devkit/architect';
import { WorkspaceNodeModulesArchitectHost } from '@angular-devkit/architect/node';
import { TestProjectHost, TestingArchitectHost } from '@angular-devkit/architect/testing';
import {
  getSystemPath,
  join,
  normalize,
  schema,
  virtualFs,
  workspaces,
} from '@angular-devkit/core'; // tslint:disable-line:no-implicit-dependencies
import { map, take, tap } from 'rxjs/operators';
import * as path from 'path';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 150000;

const devkitRoot: any = path.resolve(__dirname, '../../../../../../../');
const workspaceRoot = join(devkitRoot, 'tests/build_ng_packagr/ng-packaged/');

describe('NgPackagr Builder', () => {
  const host = new TestProjectHost(workspaceRoot);
  let architect: Architect;

  beforeEach(async () => {
    await host.initialize().toPromise();

    const registry = new schema.CoreSchemaRegistry();
    registry.addPostTransform(schema.transforms.addUndefinedDefaults);

    const workspaceSysPath = getSystemPath(host.root());
    const { workspace } = await workspaces.readWorkspace(
      workspaceSysPath,
      workspaces.createWorkspaceHost(host),
    );
    const architectHost = new TestingArchitectHost(
      workspaceSysPath,
      workspaceSysPath,
      new WorkspaceNodeModulesArchitectHost(workspace, workspaceSysPath),
    );
    architect = new Architect(architectHost, registry);
  });

  afterEach(() => host.restore().toPromise());

  it('builds and packages a library', async () => {
    const run = await architect.scheduleTarget({ project: 'lib', target: 'build' });

    await expectAsync(run.result).toBeResolvedTo(jasmine.objectContaining({ success: true }));

    await run.stop();

    expect(host.scopedSync().exists(normalize('./dist/lib/fesm5/lib.js'))).toBe(true);
    const content = virtualFs.fileBufferToString(
      host.scopedSync().read(normalize('./dist/lib/fesm5/lib.js')),
    );
    expect(content).toContain('lib works');
  });

  it('rebuilds on TS file changes', async () => {
    const goldenValueFiles: { [path: string]: string } = {
      'projects/lib/src/lib/lib.component.ts': `
      import { Component } from '@angular/core';
      @Component({
        selector: 'lib',
        template: 'lib update works!'
      })
      export class LibComponent { }
      `,
    };

    const run = await architect.scheduleTarget(
      { project: 'lib', target: 'build' },
      { watch: true },
    );

    let buildNumber = 0;

    await run.output.pipe(
      tap((buildEvent) => expect(buildEvent.success).toBe(true)),
      map(() => {
        const fileName = './dist/lib/fesm5/lib.js';
        const content = virtualFs.fileBufferToString(
          host.scopedSync().read(normalize(fileName)),
        );

        return content;
      }),
      tap(content => {
        buildNumber += 1;
        switch (buildNumber) {
          case 1:
            expect(content).toMatch(/lib works/);
            host.writeMultipleFiles(goldenValueFiles);
            break;

          case 2:
            expect(content).toMatch(/lib update works/);
            break;
          default:
            break;
        }
      }),
      take(2),
    ).toPromise();

    await run.stop();
  });

  it('copy asset files', async () => {
    const run = await architect.scheduleTarget({ project: 'lib', target: 'build' });

    await expectAsync(run.result).toBeResolvedTo(jasmine.objectContaining({ success: true }));

    await run.stop();

    expect(host.scopedSync().exists(normalize('./dist/lib/assets/_lib.scss'))).toBe(true);
    expect(host.scopedSync().exists(normalize('./dist/lib/assets/main.scss'))).toBe(true);
    expect(host.scopedSync().exists(normalize('./dist/lib/deep-assets/some-deep/some-deep.scss'))).toBe(true);
    expect(host.scopedSync().exists(normalize('./dist/lib/assets/some-assets/some-asset.css'))).toBe(true);
    expect(host.scopedSync().exists(normalize('./dist/lib/assets/some-assets/some-file.txt'))).toBe(false);
    expect(host.scopedSync().exists(normalize('./dist/lib/assets/deep-output/deep-assets/some-deep/some-deep.css'))).toBe(true);
    expect(host.scopedSync().exists(normalize('./dist/lib/assets/deep-output/deep-assets/some-deep/some-deep.scss'))).toBe(false);
    expect(host.scopedSync().exists(normalize('./dist/lib/assets/deep-output/deep-assets/some-deep/some-deep.txt'))).toBe(false);
  });
});


/**
 * Builds the GUI parts of the adapter. Run with `tsx tasks.ts` (see the `build:*` scripts).
 *
 *   src-admin/    -> admin/custom/       JsonConfig custom component of the tab "Mesh"
 *   src-widgets/  -> widgets/tr-064/     vis-2 widget set
 *   src-devices/  -> admin/dm-widgets/   widgets for ioBroker.devices
 *
 * All three are built with vite and module federation, which pre-builds the whole shared GUI
 * stack - so their output is committed instead of being built by `npm run build` on install.
 *
 * `tsx tasks.ts`                   - sync, (install,) build and copy every existing project
 * `tsx tasks.ts --admin --devices` - only these projects (also `--widgets`)
 * `tsx tasks.ts --install`         - run `npm install` even if `node_modules` exists
 * `tsx tasks.ts --copy`            - only copy the existing builds
 * `tsx tasks.ts --sync`            - only copy `src-shared/**` into `src/shared/` of every project
 *
 * `src-shared` has no own `node_modules`: its imports of React and MUI have to be resolved by the
 * project which uses it. Therefore it is copied into `<project>/src/shared/` (gitignored) instead
 * of being imported from outside of the project root.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { npmInstall } from '@iobroker/build-tools';

const ROOT = __dirname;
const SHARED = join(ROOT, 'src-shared');

/** One GUI project */
interface Project {
    /** Option which selects the project, e.g. `--admin` */
    option: string;
    /** Folder of the sources, e.g. `src-admin` */
    dir: string;
    /** Remote entry of module federation, which the host loads */
    entry: string;
    /** Folder the build is copied to */
    dest: string;
    /** The version of the adapter is written into the `package.json` of the project */
    versionFromRoot?: boolean;
    /** Copies additional files after the build */
    extra?: () => void;
}

/** Copies all JSON files of a folder into another one */
function copyJsonFiles(from: string, to: string): void {
    mkdirSync(to, { recursive: true });
    for (const file of readdirSync(from).filter(name => name.endsWith('.json'))) {
        cpSync(join(from, file), join(to, file));
    }
}

const PROJECTS: Project[] = [
    {
        option: '--admin',
        dir: 'src-admin',
        entry: 'customComponents.js',
        dest: 'admin/custom',
        // translations of the component (`"i18n": true` in jsonConfig.json)
        extra: () => copyJsonFiles(join(SHARED, 'i18n'), join(ROOT, 'admin/custom/i18n')),
    },
    {
        option: '--widgets',
        dir: 'src-widgets',
        entry: 'customWidgets.js',
        dest: 'widgets/tr-064',
        // vis-2 shows the version of the widget set
        versionFromRoot: true,
        // the previews of the palette (`visPrev` of the widgets)
        extra: () => cpSync(join(ROOT, 'src-widgets/build/img'), join(ROOT, 'widgets/tr-064/img'), { recursive: true }),
    },
    {
        option: '--devices',
        dir: 'src-devices',
        entry: 'customDevices.js',
        dest: 'admin/dm-widgets',
        // the icons which `common.deviceWidgets` of io-package.json refers to
        extra: () => {
            const img = join(ROOT, 'src-devices/img');
            if (existsSync(img)) {
                cpSync(img, join(ROOT, 'admin/dm-widgets'), { recursive: true });
            }
        },
    },
];

/** Copies `src-shared/**` into `src/shared/` of every existing project */
function sync(): void {
    for (const project of PROJECTS) {
        const dir = join(ROOT, project.dir);
        if (!existsSync(join(dir, 'package.json'))) {
            continue;
        }
        const target = join(dir, 'src', 'shared');
        rmSync(target, { recursive: true, force: true });
        cpSync(SHARED, target, { recursive: true });
        console.log(`Synchronized src-shared to ${project.dir}/src/shared`);
    }
}

/**
 * Copies what the host loads: the remote entry, `mf-manifest.json` (admin and vis-2 check the
 * GUI API generation with it) and the chunks. `index.html` with its chunks is only the simulation
 * of `npm start` with mock data - a chunk of it is copied only if a needed file refers to it.
 */
function copy(project: Project): void {
    const build = join(ROOT, project.dir, 'build');
    const dest = join(ROOT, project.dest);
    if (!existsSync(join(build, project.entry))) {
        throw new Error(`${project.dir}/build/${project.entry} does not exist - build first`);
    }
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });

    for (const file of [project.entry, 'mf-manifest.json']) {
        if (existsSync(join(build, file))) {
            cpSync(join(build, file), join(dest, file));
        }
    }

    const assetsDir = join(build, 'assets');
    const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
    const simulation = assets.filter(name => /^(index|mf-entry-bootstrap-\d+)-[\w-]+\.js$/.test(name));
    const needed = assets
        .filter(name => !simulation.includes(name))
        .map(name => readFileSync(join(assetsDir, name), 'utf8'))
        .concat(readFileSync(join(build, project.entry), 'utf8'));
    for (const name of assets) {
        if (!simulation.includes(name) || needed.some(content => content.includes(name))) {
            cpSync(join(assetsDir, name), join(dest, 'assets', name), { recursive: true });
        }
    }
    if (existsSync(join(build, '.vite', 'manifest.json'))) {
        cpSync(join(build, '.vite', 'manifest.json'), join(dest, '.vite', 'manifest.json'));
    }

    project.extra?.();
    console.log(`Copied ${project.dir}/build to ${project.dest}`);
}

/** Writes the version of the adapter into the `package.json` of a project */
function copyVersion(dir: string): void {
    const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
    const file = join(dir, 'package.json');
    const text = readFileSync(file, 'utf8');
    const pack = JSON.parse(text) as { version?: string };
    if (pack.version !== version) {
        pack.version = version;
        writeFileSync(
            file,
            `${JSON.stringify(pack, null, 4)}
`,
        );
    }
}

async function build(project: Project, install: boolean): Promise<void> {
    const dir = join(ROOT, project.dir);
    if (install || !existsSync(join(dir, 'node_modules'))) {
        await npmInstall(dir);
    }
    if (project.versionFromRoot) {
        copyVersion(dir);
    }
    rmSync(join(dir, 'build'), { recursive: true, force: true });
    // `npm run build` of the project, not `buildReact()` of build-tools: that forks vite with the
    // `execArgv` of this process, i.e. with the loader of tsx, which loads a CommonJS vite config
    // without `import.meta.resolve` - and @module-federation/vite needs it
    console.log(`> npm run build (in ${project.dir})`);
    execSync('npm run build', { cwd: dir, stdio: 'inherit' });
    copy(project);
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.includes('--sync')) {
        sync();
        return;
    }

    const existing = PROJECTS.filter(project => existsSync(join(ROOT, project.dir, 'package.json')));
    const selected = existing.filter(project => args.includes(project.option));
    const projects = selected.length ? selected : existing;

    if (args.includes('--copy')) {
        projects.forEach(copy);
        return;
    }

    sync();
    for (const project of projects) {
        await build(project, args.includes('--install'));
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});

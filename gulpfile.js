import gulp from 'gulp';
import install from 'gulp-install';
import babel from 'gulp-babel';
import del from 'del';
import sourcemaps from 'gulp-sourcemaps';
import map from 'map-stream';
import { exec } from 'pkg';

gulp.task('install', () =>
  gulp.src(['package.json'], { base: '.' }).pipe(install())
);

gulp.task('clean', () => del(['dist/src']));

gulp.task('package', () =>
  gulp
    .src('package.json')
    .pipe(
      map((file, done) => {
        const json = JSON.parse(file.contents.toString());
        delete json.type;
        // eslint-disable-next-line no-param-reassign
        file.contents = Buffer.from(JSON.stringify(json));
        done(null, file);
      })
    )
    .pipe(gulp.dest('dist'))
);

gulp.task('dist-install', () =>
  gulp.src(['dist/package.json'], { base: 'dist' }).pipe(install())
);

gulp.task('transpile', () =>
  gulp
    .src(['src/*.js', 'src/**/*.js'])
    .pipe(sourcemaps.init({ loadMaps: true }))
    .pipe(
      babel({
        plugins: [
          [
            '@babel/plugin-transform-modules-commonjs',
            {
              importInterop: 'babel',
            },
          ],
          ['babel-plugin-transform-import-meta'],
        ],
      })
    )
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist/src'))
);

gulp.task('resources', () =>
  gulp.src(['src/**/*.json'], { base: './' }).pipe(gulp.dest('dist'))
);

gulp.task('pkg', () => {
  switch (process.platform) {
    case 'darwin':
      console.log('Building MacOS binary.');
      return exec([
        '-C',
        'Gzip',
        '-t',
        'node18-macos-x64',
        '-o',
        'dist/bin/macos/frodo',
        'dist',
      ]);
    case 'linux':
      console.log('Building Linux binary.');
      return exec([
        '-C',
        'Gzip',
        '-t',
        'node18-linux-x64',
        '-o',
        'dist/bin/linux/frodo',
        'dist',
      ]);
    case 'win32':
      console.log('Building Windows binary.');
      return exec([
        '-C',
        'Gzip',
        '-t',
        'node18-win-x64',
        '-o',
        'dist/bin/win/frodo',
        'dist',
      ]);
    default:
      console.log('Unsupported OS - not building binaries.');
      return null;
  }
});

gulp.task(
  'default',
  gulp.series(
    'install',
    'clean',
    'package',
    'dist-install',
    'transpile',
    'resources',
    'pkg'
  )
);

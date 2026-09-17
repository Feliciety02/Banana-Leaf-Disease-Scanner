import {
  type ConfigPlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withProjectBuildGradle,
} from 'expo/config-plugins';
import fs from 'fs';
import path from 'path';

const LITERT_DEPENDENCIES = [
  "implementation 'com.google.ai.edge.litert:litert:1.4.0'",
  "implementation 'com.google.ai.edge.litert:litert-api:1.4.0'",
];

const MODELS_RELATIVE_DIR = 'assets/models';

const withTFLiteDependency: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('com.google.ai.edge.litert:litert:')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${LITERT_DEPENDENCIES.join('\n    ')}`,
      );
    }
    return mod;
  });

const withTFLiteNdkFilters: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('abiFilters')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /subprojects\s*\{/,
        `subprojects {
    afterEvaluate { project ->
        if (project.hasProperty('android')) {
            project.android {
                defaultConfig {
                    ndk {
                        abiFilters 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
                    }
                }
            }
        }
    }`,
      );
    }
    return mod;
  });

const withAndroidSecurity: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android application manifest entry is missing.');
    application.$['android:allowBackup'] = 'false';
    application.$['android:usesCleartextTraffic'] = 'false';
    return mod;
  });

const withTFLiteModelAssets: ConfigPlugin<{ modelsDir?: string }> = (config, props = {}) =>
  withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const modelsDir = path.resolve(
        modConfig.modRequest.projectRoot,
        props.modelsDir ?? MODELS_RELATIVE_DIR,
      );
      const assetsDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
      );
      const modelFiles = fs
        .readdirSync(modelsDir)
        .filter((file) => file.endsWith('.tflite'));
      if (modelFiles.length === 0) {
        throw new Error(
          `No .tflite models found in ${MODELS_RELATIVE_DIR}/. Copy the trained models there and rebuild.`,
        );
      }
      fs.mkdirSync(assetsDir, { recursive: true });
      for (const file of modelFiles) {
        fs.copyFileSync(path.join(modelsDir, file), path.join(assetsDir, file));
      }
      return modConfig;
    },
  ]);

const withTFLite: ConfigPlugin<{ modelsDir?: string }> = (config, props = {}) => {
  config = withTFLiteDependency(config);
  config = withTFLiteNdkFilters(config);
  config = withAndroidSecurity(config);
  config = withTFLiteModelAssets(config, props);
  return config;
};

export default withTFLite;
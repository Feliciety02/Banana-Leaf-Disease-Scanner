import {
  type ConfigPlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withProjectBuildGradle,
} from 'expo/config-plugins';

const LITERT_DEPENDENCIES = [
  "implementation 'com.google.ai.edge.litert:litert:1.4.0'",
  "implementation 'com.google.ai.edge.litert:litert-api:1.4.0'",
];

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

const withTFLite: ConfigPlugin<Record<string, never>> = (config) => {
  config = withTFLiteDependency(config);
  config = withTFLiteNdkFilters(config);
  config = withAndroidSecurity(config);
  return config;
};

export default withTFLite;

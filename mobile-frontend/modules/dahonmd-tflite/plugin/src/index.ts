import {
  type ConfigPlugin,
  withAppBuildGradle,
  withProjectBuildGradle,
} from 'expo/config-plugins';

const TFLITE_DEPENDENCY = "implementation 'org.tensorflow:tensorflow-lite:2.16.1'";

const withTFLiteDependency: ConfigPlugin = (config) =>
  withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('tensorflow-lite')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    ${TFLITE_DEPENDENCY}`,
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

const withTFLite: ConfigPlugin<Record<string, never>> = (config) => {
  config = withTFLiteDependency(config);
  config = withTFLiteNdkFilters(config);
  return config;
};

export default withTFLite;

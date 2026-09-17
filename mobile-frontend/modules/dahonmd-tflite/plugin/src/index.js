"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");
const LITERT_DEPENDENCIES = [
    "implementation 'com.google.ai.edge.litert:litert:1.4.0'",
    "implementation 'com.google.ai.edge.litert:litert-api:1.4.0'",
];
const MODELS_RELATIVE_DIR = 'assets/models';
const withTFLiteDependency = (config) => (0, config_plugins_1.withAppBuildGradle)(config, (mod) => {
    if (!mod.modResults.contents.includes('com.google.ai.edge.litert:litert:')) {
        mod.modResults.contents = mod.modResults.contents.replace(/dependencies\s*\{/, `dependencies {\n    ${LITERT_DEPENDENCIES.join('\n    ')}`);
    }
    return mod;
});
const withTFLiteNdkFilters = (config) => (0, config_plugins_1.withProjectBuildGradle)(config, (mod) => {
    if (!mod.modResults.contents.includes('abiFilters')) {
        mod.modResults.contents = mod.modResults.contents.replace(/subprojects\s*\{/, `subprojects {
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
    }`);
    }
    return mod;
});
const withAndroidSecurity = (config) => (0, config_plugins_1.withAndroidManifest)(config, (mod) => {
    var _a;
    const application = (_a = mod.modResults.manifest.application) === null || _a === void 0 ? void 0 : _a[0];
    if (!application)
        throw new Error('Android application manifest entry is missing.');
    application.$['android:allowBackup'] = 'false';
    application.$['android:usesCleartextTraffic'] = 'false';
    return mod;
});
const withTFLiteModelAssets = (config, props = {}) => (0, config_plugins_1.withDangerousMod)(config, [
    'android',
    async (modConfig) => {
        const modelsDir = path.resolve(modConfig.modRequest.projectRoot, props.modelsDir ?? MODELS_RELATIVE_DIR);
        const assetsDir = path.join(modConfig.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
        const modelFiles = fs.readdirSync(modelsDir).filter((file) => file.endsWith('.tflite'));
        if (modelFiles.length === 0) {
            throw new Error(`No .tflite models found in ${MODELS_RELATIVE_DIR}/. Copy the trained models there and rebuild.`);
        }
        fs.mkdirSync(assetsDir, { recursive: true });
        for (const file of modelFiles) {
            fs.copyFileSync(path.join(modelsDir, file), path.join(assetsDir, file));
        }
        return modConfig;
    },
]);
const withTFLite = (config, props = {}) => {
    config = withTFLiteDependency(config);
    config = withTFLiteNdkFilters(config);
    config = withAndroidSecurity(config);
    config = withTFLiteModelAssets(config, props);
    return config;
};
exports.default = withTFLite;
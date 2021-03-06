/**
 * @fileoverview Tests for configInitializer.
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
    fs = require("fs"),
    path = require("path"),
    os = require("os"),
    sinon = require("sinon"),
    sh = require("shelljs"),
    autoconfig = require("../../../lib/config/autoconfig"),
    npmUtil = require("../../../lib/util/npm-util");

const originalDir = process.cwd();
const proxyquire = require("proxyquire").noPreserveCache();

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

let answers = {};

describe("configInitializer", () => {

    let fixtureDir,
        npmCheckStub,
        npmInstallStub,
        npmFetchPeerDependenciesStub,
        init,
        localESLintVersion = null;

    const log = {
        info: sinon.spy(),
        error: sinon.spy()
    };
    const requireStubs = {
        "../logging": log,
        "../util/module-resolver": class ModuleResolver {

            /**
             * @returns {string} The path to local eslint to test.
             */
            resolve() { // eslint-disable-line class-methods-use-this
                if (localESLintVersion) {
                    return `local-eslint-${localESLintVersion}`;
                }
                throw new Error("Cannot find module");
            }
        },
        "local-eslint-3.18.0": { linter: { version: "3.18.0" }, "@noCallThru": true },
        "local-eslint-3.19.0": { linter: { version: "3.19.0" }, "@noCallThru": true },
        "local-eslint-4.0.0": { linter: { version: "4.0.0" }, "@noCallThru": true }
    };

    /**
     * Returns the path inside of the fixture directory.
     * @returns {string} The path inside the fixture directory.
     * @private
     */
    function getFixturePath(...args) {
        const filepath = path.join(fixtureDir, ...args);

        try {
            return fs.realpathSync(filepath);
        } catch (e) {
            return filepath;
        }
    }

    // copy into clean area so as not to get "infected" by this project's .eslintrc files
    before(() => {
        fixtureDir = `${os.tmpdir()}/eslint/fixtures/config-initializer`;
        sh.mkdir("-p", fixtureDir);
        sh.cp("-r", "./tests/fixtures/config-initializer/.", fixtureDir);
        fixtureDir = fs.realpathSync(fixtureDir);
    });

    beforeEach(() => {
        npmInstallStub = sinon.stub(npmUtil, "installSyncSaveDev");
        npmCheckStub = sinon.stub(npmUtil, "checkDevDeps").callsFake(packages => packages.reduce((status, pkg) => {
            status[pkg] = false;
            return status;
        }, {}));
        npmFetchPeerDependenciesStub = sinon
            .stub(npmUtil, "fetchPeerDependencies")
            .returns({
                eslint: "^3.19.0",
                "eslint-plugin-jsx-a11y": "^5.0.1",
                "eslint-plugin-import": "^2.2.0",
                "eslint-plugin-react": "^7.0.1"
            });
        init = proxyquire("../../../lib/config/config-initializer", requireStubs);
    });

    afterEach(() => {
        log.info.reset();
        log.error.reset();
        npmInstallStub.restore();
        npmCheckStub.restore();
        npmFetchPeerDependenciesStub.restore();
    });

    after(() => {
        sh.rm("-r", fixtureDir);
    });

    describe("processAnswers()", () => {

        describe("prompt", () => {

            beforeEach(() => {
                answers = {
                    source: "prompt",
                    extendDefault: true,
                    indent: 2,
                    quotes: "single",
                    linebreak: "unix",
                    semi: true,
                    es6: true,
                    modules: true,
                    env: ["browser"],
                    jsx: false,
                    react: false,
                    format: "JSON",
                    commonjs: false
                };
            });

            it("should create default config", () => {
                const config = init.processAnswers(answers);

                assert.deepStrictEqual(config.rules.indent, ["error", 2]);
                assert.deepStrictEqual(config.rules.quotes, ["error", "single"]);
                assert.deepStrictEqual(config.rules["linebreak-style"], ["error", "unix"]);
                assert.deepStrictEqual(config.rules.semi, ["error", "always"]);
                assert.strictEqual(config.env.es6, true);
                assert.strictEqual(config.parserOptions.sourceType, "module");
                assert.strictEqual(config.env.browser, true);
                assert.strictEqual(config.extends, "eslint:recommended");
            });

            it("should disable semi", () => {
                answers.semi = false;
                const config = init.processAnswers(answers);

                assert.deepStrictEqual(config.rules.semi, ["error", "never"]);
            });

            it("should enable jsx flag", () => {
                answers.jsx = true;
                const config = init.processAnswers(answers);

                assert.strictEqual(config.parserOptions.ecmaFeatures.jsx, true);
            });

            it("should enable react plugin", () => {
                answers.jsx = true;
                answers.react = true;
                const config = init.processAnswers(answers);

                assert.strictEqual(config.parserOptions.ecmaFeatures.jsx, true);
                assert.strictEqual(config.parserOptions.ecmaVersion, 2018);
                assert.deepStrictEqual(config.plugins, ["react"]);
            });

            it("should not enable es6", () => {
                answers.es6 = false;
                const config = init.processAnswers(answers);

                assert.isUndefined(config.env.es6);
            });

            it("should extend eslint:recommended", () => {
                const config = init.processAnswers(answers);

                assert.strictEqual(config.extends, "eslint:recommended");
            });

            it("should not use commonjs by default", () => {
                const config = init.processAnswers(answers);

                assert.isUndefined(config.env.commonjs);
            });

            it("should use commonjs when set", () => {
                answers.commonjs = true;
                const config = init.processAnswers(answers);

                assert.isTrue(config.env.commonjs);
            });
        });

        describe("guide", () => {
            it("should support the google style guide", () => {
                const config = init.getConfigForStyleGuide("google");

                assert.deepStrictEqual(config, { extends: "google", installedESLint: true });
            });

            it("should support the airbnb style guide", () => {
                const config = init.getConfigForStyleGuide("airbnb");

                assert.deepStrictEqual(config, { extends: "airbnb", installedESLint: true });
            });

            it("should support the airbnb base style guide", () => {
                const config = init.getConfigForStyleGuide("airbnb-base");

                assert.deepStrictEqual(config, { extends: "airbnb-base", installedESLint: true });
            });

            it("should support the standard style guide", () => {
                const config = init.getConfigForStyleGuide("standard");

                assert.deepStrictEqual(config, { extends: "standard", installedESLint: true });
            });

            it("should throw when encountering an unsupported style guide", () => {
                assert.throws(() => {
                    init.getConfigForStyleGuide("non-standard");
                }, "You referenced an unsupported guide.");
            });

            it("should install required sharable config", () => {
                init.getConfigForStyleGuide("google");
                assert(npmInstallStub.calledOnce);
                assert(npmInstallStub.firstCall.args[0].some(name => name.startsWith("eslint-config-google@")));
            });

            it("should install ESLint if not installed locally", () => {
                init.getConfigForStyleGuide("google");
                assert(npmInstallStub.calledOnce);
                assert(npmInstallStub.firstCall.args[0].some(name => name.startsWith("eslint@")));
            });

            it("should install peerDependencies of the sharable config", () => {
                init.getConfigForStyleGuide("airbnb");

                assert(npmFetchPeerDependenciesStub.calledOnce);
                assert(npmFetchPeerDependenciesStub.firstCall.args[0] === "eslint-config-airbnb@latest");
                assert(npmInstallStub.calledOnce);
                assert.deepStrictEqual(
                    npmInstallStub.firstCall.args[0],
                    [
                        "eslint-config-airbnb@latest",
                        "eslint@^3.19.0",
                        "eslint-plugin-jsx-a11y@^5.0.1",
                        "eslint-plugin-import@^2.2.0",
                        "eslint-plugin-react@^7.0.1"
                    ]
                );
            });

            describe("hasESLintVersionConflict (Note: peerDependencies always `eslint: \"^3.19.0\"` by stubs)", () => {
                describe("if local ESLint is not found,", () => {
                    before(() => {
                        localESLintVersion = null;
                    });

                    it("should return false.", () => {
                        const result = init.hasESLintVersionConflict({ styleguide: "airbnb" });

                        assert.strictEqual(result, false);
                    });
                });

                describe("if local ESLint is 3.19.0,", () => {
                    before(() => {
                        localESLintVersion = "3.19.0";
                    });

                    it("should return false.", () => {
                        const result = init.hasESLintVersionConflict({ styleguide: "airbnb" });

                        assert.strictEqual(result, false);
                    });
                });

                describe("if local ESLint is 4.0.0,", () => {
                    before(() => {
                        localESLintVersion = "4.0.0";
                    });

                    it("should return true.", () => {
                        const result = init.hasESLintVersionConflict({ styleguide: "airbnb" });

                        assert.strictEqual(result, true);
                    });
                });

                describe("if local ESLint is 3.18.0,", () => {
                    before(() => {
                        localESLintVersion = "3.18.0";
                    });

                    it("should return true.", () => {
                        const result = init.hasESLintVersionConflict({ styleguide: "airbnb" });

                        assert.strictEqual(result, true);
                    });
                });
            });
        });

        describe("auto", () => {
            const completeSpy = sinon.spy();
            let config;
            let sandbox;

            before(() => {
                const patterns = [
                    getFixturePath("lib"),
                    getFixturePath("tests")
                ].join(" ");

                answers = {
                    source: "auto",
                    patterns,
                    es6: false,
                    env: ["browser"],
                    jsx: false,
                    react: false,
                    format: "JSON",
                    commonjs: false
                };

                sandbox = sinon.sandbox.create();
                sandbox.stub(console, "log"); // necessary to replace, because of progress bar

                process.chdir(fixtureDir);
                config = init.processAnswers(answers);
                sandbox.restore();
            });

            after(() => {
                sandbox.restore();
            });

            afterEach(() => {
                process.chdir(originalDir);
                sandbox.restore();
            });

            it("should create a config", () => {
                assert.isTrue(completeSpy.notCalled);
                assert.ok(config);
            });

            it("should create the config based on examined files", () => {
                assert.deepStrictEqual(config.rules.quotes, ["error", "double"]);
                assert.strictEqual(config.rules.semi, "off");
            });

            it("should extend and not disable recommended rules", () => {
                assert.strictEqual(config.extends, "eslint:recommended");
                assert.notProperty(config.rules, "no-console");
            });

            it("should throw on fatal parsing error", () => {
                const filename = getFixturePath("parse-error");

                sandbox.stub(autoconfig, "extendFromRecommended");
                answers.patterns = filename;
                process.chdir(fixtureDir);
                assert.throws(() => {
                    config = init.processAnswers(answers);
                }, "Parsing error: Unexpected token ;");
            });

            it("should throw if no files are matched from patterns", () => {
                sandbox.stub(autoconfig, "extendFromRecommended");
                answers.patterns = "not-a-real-filename";
                process.chdir(fixtureDir);
                assert.throws(() => {
                    config = init.processAnswers(answers);
                }, "No files matching 'not-a-real-filename' were found.");
            });
        });
    });
});

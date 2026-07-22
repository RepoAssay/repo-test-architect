import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectManifestSignals,
  inspectRootEntries,
  parseArgs,
  rankCandidates,
  scoreCandidate,
  validationProfiles
} from "../scripts/find-validation-repos.js";

const now = new Date("2026-07-17T12:00:00Z");

describe("validation repository finder", () => {
  it("parses profiles and deterministic quality filters", () => {
    assert.deepEqual(parseArgs([
      "--profile", "react,workspace",
      "--limit=8",
      "--min-stars", "100",
      "--max-size-mb", "250",
      "--pushed-since", "2026-01-01",
      "--format", "json"
    ], now), {
      profiles: ["react", "workspace"],
      limit: 8,
      searchLimit: 25,
      minStars: 100,
      maxSizeMb: 250,
      pushedSince: "2026-01-01",
      includeForks: false,
      format: "json",
      help: false,
      listProfiles: false
    });
  });

  it("rejects unknown profiles and malformed values", () => {
    assert.throws(() => parseArgs(["--profile", "rust"], now), /Unknown profile/);
    assert.throws(() => parseArgs(["--limit", "0"], now), /positive integer/);
    assert.throws(() => parseArgs(["--pushed-since", "yesterday"], now), /YYYY-MM-DD/);
  });

  it("requires exact root manifests and their ecosystem markers", () => {
    const searches = [
      { signal: "react-testing-library", file: "package.json", pattern: /"@testing-library\/react"/ },
      { signal: "pnpm-workspace", file: "pnpm-workspace.yaml", pattern: /^\s*packages\s*:/m }
    ];

    assert.deepEqual(detectManifestSignals(searches, {
      "package.json": '{"devDependencies":{"@testing-library/react":"latest"}}',
      "package.json.md": '"@testing-library/react"',
      "pnpm-workspace.yaml": "packages:\n  - packages/*"
    }), {
      signals: ["react-testing-library", "pnpm-workspace"],
      matchedPaths: ["package.json", "pnpm-workspace.yaml"]
    });
  });

  it("detects exact root project and test directory signals", () => {
    const searches = [
      { signal: "xcode-project", entryPattern: /\.xcodeproj$/ },
      { signal: "root-tests", entryPattern: /^Tests$/ }
    ];

    assert.deepEqual(detectManifestSignals(searches, {}, [
      { name: "Checkout.xcodeproj", type: "dir" },
      { name: "Tests", type: "dir" },
      { name: "Examples", type: "dir" }
    ]), {
      signals: ["xcode-project", "root-tests"],
      matchedPaths: ["Checkout.xcodeproj", "Tests"]
    });
  });

  it("defines browser and Bun validation profiles from exact package signals", () => {
    const packageJson = JSON.stringify({
      scripts: { test: "bun test" },
      devDependencies: { "@playwright/test": "latest", cypress: "latest" }
    });

    for (const [profile, expectedSignal] of [
      ["playwright", "playwright-test"],
      ["cypress", "cypress-test"],
      ["bun", "bun-test"]
    ]) {
      assert.deepEqual(detectManifestSignals(validationProfiles[profile].searches, { "package.json": packageJson }), {
        signals: [expectedSignal],
        matchedPaths: ["package.json"]
      });
    }
  });

  it("defines distinct Swift validation profiles for supported project shapes", () => {
    assert.deepEqual(
      ["swift", "swiftui-xcode", "swift-vapor", "swift-bazel", "swift-macro", "swift-legacy"]
        .map((profile) => [profile, validationProfiles[profile].language]),
      [
        ["swift", "Swift"],
        ["swiftui-xcode", "Swift"],
        ["swift-vapor", "Swift"],
        ["swift-bazel", "Starlark"],
        ["swift-macro", "Swift"],
        ["swift-legacy", "Swift"]
      ]
    );
  });

  it("defines Python validation profiles for package, framework, and advanced pytest shapes", () => {
    assert.deepEqual(
      ["python", "python-pytest", "python-fastapi", "python-django", "python-flask", "python-advanced"].map((profile) => validationProfiles[profile].language),
      ["Python", "Python", "Python", "Python", "Python", "Python"]
    );

    assert.deepEqual(detectManifestSignals(validationProfiles.python.searches, {
      "pyproject.toml": "[project]\nname = \"checkout\"\n"
    }, [{ name: "tests", type: "dir" }]), {
      signals: ["python-project", "root-python-tests"],
      matchedPaths: ["pyproject.toml", "tests"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["python-pytest"].searches, {
      "pyproject.toml": "[project.optional-dependencies]\ntest = [\"pytest\"]\n"
    }), {
      signals: ["pyproject-pytest"],
      matchedPaths: ["pyproject.toml"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["python-pytest"].searches, {
      "pytest.toml": "[pytest]\ntestpaths = [\"tests\"]\n"
    }), {
      signals: ["pytest-toml"],
      matchedPaths: ["pytest.toml"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["python-fastapi"].searches, {
      "requirements.txt": "fastapi==0.115.0\nuvicorn==0.34.0\n"
    }), {
      signals: ["requirements-fastapi"],
      matchedPaths: ["requirements.txt"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["python-django"].searches, {
      "pyproject.toml": "[project]\ndependencies = [\"Django\"]\n"
    }), {
      signals: ["pyproject-django"],
      matchedPaths: ["pyproject.toml"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["python-flask"].searches, {
      "requirements.txt": "Flask==3.1.0\n"
    }), {
      signals: ["requirements-flask"],
      matchedPaths: ["requirements.txt"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["python-advanced"].searches, {
      "noxfile.py": "import nox\n@nox.session\ndef tests(session):\n    session.run(\"pytest\")\n",
      ".coveragerc": "[run]\nbranch = true\n"
    }), {
      signals: ["nox-test-session", "coverage-config"],
      matchedPaths: ["noxfile.py", ".coveragerc"]
    });
  });

  it("defines JVM validation profiles for Gradle, Maven JUnit, Kotest, and TestNG projects", () => {
    assert.deepEqual(
      ["gradle", "gradle-junit", "gradle-kotest", "gradle-testng", "maven", "maven-junit", "maven-testng"].map((profile) => validationProfiles[profile].language),
      ["Kotlin", "Kotlin", "Kotlin", "Kotlin", "Java", "Java", "Java"]
    );

    assert.deepEqual(detectManifestSignals(validationProfiles["gradle-junit"].searches, {
      "build.gradle.kts": 'dependencies { testImplementation(kotlin("test")) }\ntasks.test { useJUnitPlatform() }\n'
    }, [{ name: "gradlew", type: "file" }]), {
      signals: ["gradle-junit", "gradle-wrapper"],
      matchedPaths: ["build.gradle.kts", "gradlew"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["maven-junit"].searches, {
      "pom.xml": "<project><dependency><artifactId>junit-jupiter</artifactId></dependency></project>"
    }, [{ name: "mvnw", type: "file" }]), {
      signals: ["maven-junit", "maven-wrapper"],
      matchedPaths: ["pom.xml", "mvnw"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["gradle-kotest"].searches, {
      "build.gradle.kts": 'dependencies { testImplementation("io.kotest:kotest-runner-junit5:6.0.0") }\ntasks.test { useJUnitPlatform() }\n'
    }, [{ name: "gradlew", type: "file" }]), {
      signals: ["gradle-kotest", "gradle-wrapper"],
      matchedPaths: ["build.gradle.kts", "gradlew"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["gradle-testng"].searches, {
      "build.gradle.kts": 'dependencies { testImplementation("org.testng:testng:7.11.0") }\ntasks.test { useTestNG() }\n'
    }, [{ name: "gradlew", type: "file" }]), {
      signals: ["gradle-testng", "gradle-wrapper"],
      matchedPaths: ["build.gradle.kts", "gradlew"]
    });

    assert.deepEqual(detectManifestSignals(validationProfiles["maven-testng"].searches, {
      "pom.xml": "<project><dependency><groupId>org.testng</groupId><artifactId>testng</artifactId></dependency></project>"
    }, [{ name: "mvnw", type: "file" }]), {
      signals: ["maven-testng", "maven-wrapper"],
      matchedPaths: ["pom.xml", "mvnw"]
    });
  });

  it("detects root lockfiles and CI configuration", () => {
    assert.deepEqual(inspectRootEntries([
      { name: ".github", type: "dir" },
      { name: "pnpm-lock.yaml", type: "file" },
      { name: "Package.resolved", type: "file" },
      { name: "uv.lock", type: "file" }
    ], [{ name: "test.yml", type: "file" }]), {
      hasCi: true,
      lockfiles: ["Package.resolved", "pnpm-lock.yaml", "uv.lock"]
    });
  });

  it("rewards exact signals, maintenance, CI, lockfiles, and manageable size", () => {
    const strong = {
      signals: ["react-testing-library", "workspace"],
      stars: 5000,
      pushedAt: "2026-07-01T00:00:00Z",
      sizeMb: 80,
      hasCi: true,
      lockfiles: ["pnpm-lock.yaml"],
      license: "mit"
    };
    const weak = {
      signals: ["react-testing-library"],
      stars: 80,
      pushedAt: "2025-01-01T00:00:00Z",
      sizeMb: 700,
      hasCi: false,
      lockfiles: [],
      license: null
    };

    assert.ok(scoreCandidate(strong, now) > scoreCandidate(weak, now));
    assert.equal(rankCandidates([
      { repo: "weak/project", ...weak },
      { repo: "strong/project", ...strong }
    ], now)[0].repo, "strong/project");
  });
});

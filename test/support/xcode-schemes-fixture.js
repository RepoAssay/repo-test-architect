import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** A shared scheme as Xcode writes it: a TestAction with one enabled testable. */
export function sharedSchemeXml(testable = "AppTests", { skipped = "NO", container = "App.xcodeproj" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Scheme LastUpgradeVersion = "1610" version = "1.7">\n   <TestAction buildConfiguration = "Debug">\n      <Testables>\n         <TestableReference skipped = "${skipped}" parallelizable = "YES">\n            <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "T1" BuildableName = "${testable}.xctest" BlueprintName = "${testable}" ReferencedContainer = "container:${container}"/>\n         </TestableReference>\n      </Testables>\n   </TestAction>\n</Scheme>\n`;
}

/**
 * An Xcode project (ShopApp.xcodeproj) with two test-capable shared schemes, Shop and "Shop Beta",
 * neither of which matches the container name, so command selection needs an explicit scheme (#310).
 * The temporary directory is removed when the test finishes.
 */
export function createAmbiguousSchemeProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-test-architect-xcode-scheme-input-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, content) => {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  };
  write("ShopApp.xcodeproj/project.pbxproj", "// !$*UTF8*$!\n{ archiveVersion = 1; objectVersion = 56; objects = { }; rootObject = 0; }\n");
  write("ShopApp.xcodeproj/xcshareddata/xcschemes/Shop.xcscheme", sharedSchemeXml("ShopTests", { container: "ShopApp.xcodeproj" }));
  write("ShopApp.xcodeproj/xcshareddata/xcschemes/Shop Beta.xcscheme", sharedSchemeXml("ShopTests", { container: "ShopApp.xcodeproj" }));
  write("Shop/PriceFormatter.swift", "import Foundation\nstruct PriceFormatter {\n    func format(_ cents: Int) -> String {\n        if cents < 0 { return \"-\" }\n        return \"\\(cents / 100).\\(cents % 100)\"\n    }\n}\n");
  write("ShopTests/PriceFormatterTests.swift", "import XCTest\n@testable import Shop\nfinal class PriceFormatterTests: XCTestCase { func testFormat() { XCTAssertEqual(PriceFormatter().format(105), \"1.5\") } }\n");
  return root;
}

export const SELECTED_SCHEME_COMMAND = "xcodebuild test -project ShopApp.xcodeproj -scheme \"Shop Beta\"";

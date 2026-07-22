plugins {
  kotlin("jvm")
}

dependencies {
  testImplementation(project(":token-core"))
  testImplementation(kotlin("test"))
}

tasks.test {
  useJUnitPlatform()
}

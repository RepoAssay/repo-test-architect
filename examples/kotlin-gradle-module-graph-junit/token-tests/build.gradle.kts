plugins {
  kotlin("jvm")
}

dependencies {
  testImplementation(project(":token-api"))
  testImplementation(kotlin("test"))
}

tasks.test {
  useJUnitPlatform()
}

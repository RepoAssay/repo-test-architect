plugins {
    kotlin("jvm")
}

dependencies {
    testImplementation("io.kotest:kotest-runner-junit5:6.0.0")
    testImplementation("io.kotest:kotest-assertions-core:6.0.0")
}

tasks.test {
    useJUnitPlatform()
}
